import socket
import json
import struct
import urllib.request
import time
import sqlite3
import base64

def get_credits_from_db():
    db_path = "/Users/yitao/Library/Application Support/Antigravity/User/globalStorage/state.vscdb"
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM ItemTable WHERE key='antigravityUnifiedStateSync.modelCredits'")
        row = cursor.fetchone()
        conn.close()
        if not row:
            return 0
        raw_val = row[0]
        binary_data = base64.b64decode(raw_val)
        
        idx = binary_data.find(b'availableCreditsSentinelKey')
        if idx == -1:
            return 0
            
        sub_data = binary_data[idx + len('availableCreditsSentinelKey'):]
        pos = -1
        for i, b in enumerate(sub_data):
            if b == 0x0a:
                pos = i
                break
        if pos == -1:
            return 0
            
        length = sub_data[pos + 1]
        b64_str = sub_data[pos + 2 : pos + 2 + length].decode('utf-8')
        inner_bytes = base64.b64decode(b64_str)
        
        if len(inner_bytes) < 2 or inner_bytes[0] != 0x10:
            return 0
            
        val = 0
        shift = 0
        for b in inner_bytes[1:]:
            val |= (b & 0x7f) << shift
            if not (b & 0x80):
                break
            shift += 7
        return val
    except Exception as e:
        print("❌ Error reading state.vscdb for credits:", e)
        return 0

def evaluate_js(port, path, expression):
    """
    Connects to the WebSocket, evaluates the JS expression, and returns the response.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(2.0)
    try:
        s.connect(('localhost', port))
        
        # WebSocket Handshake
        handshake = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: localhost:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        s.sendall(handshake.encode('utf-8'))
        
        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = s.recv(1024)
            if not chunk:
                break
            resp += chunk
            
        if b"101" not in resp:
            s.close()
            return None
            
        # Build Chrome DevTools Protocol (CDP) payload
        payload = json.dumps({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": expression
            }
        })
        
        payload_bytes = payload.encode('utf-8')
        length = len(payload_bytes)
        frame = bytearray([0x81])
        if length <= 125:
            frame.append(0x80 | length)
        elif length <= 65535:
            frame.append(0x80 | 126)
            frame.extend(struct.pack('>H', length))
        else:
            frame.append(0x80 | 127)
            frame.extend(struct.pack('>Q', length))
            
        frame.extend([0, 0, 0, 0])  # Masking key (all 0s)
        frame.extend(payload_bytes)
        
        s.sendall(frame)
        
        # Read response
        data = s.recv(4096)
        s.close()
        return data
    except Exception:
        try:
            s.close()
        except Exception:
            pass
        return None

def is_quota_loaded(port, path):
    try:
        res = evaluate_js(port, path, "!!window.__antigravityQuotaLauncher")
        if res and b'"value":true' in res:
            return True
    except Exception:
        pass
    return False

def inject_quota(port, path, js_code):
    try:
        res = evaluate_js(port, path, js_code)
        if res and b'"result"' in res:
            return True
    except Exception:
        pass
    return False

def update_credits_on_page(port, path, credits_val):
    try:
        evaluate_js(port, path, f"window.__antigravityCredits = {credits_val};")
    except Exception:
        pass

def main():
    print("🚀 Starting Antigravity 2.0 Quota Progress Bar injection daemon...")
    db_path = "/Users/yitao/Library/Application Support/Antigravity/User/globalStorage/state.vscdb"
    
    last_port = None
    consecutive_failures = 0
    
    # 优化状态缓存变量
    last_target_ws_url = None
    is_quota_injected = False
    last_db_mtime = 0
    last_credits_val = -1
    iteration_counter = 0
    
    while True:
        # Read the current port from DevToolsActivePort
        port = None
        try:
            with open('/Users/yitao/Library/Application Support/Antigravity/DevToolsActivePort', 'r') as f:
                port = int(f.readline().strip())
        except Exception:
            pass
            
        if not port:
            consecutive_failures += 1
            if consecutive_failures > 10:
                print("❌ DevToolsActivePort missing for a while. App probably closed. Exiting daemon.")
                break
            time.sleep(5)
            continue
            
        if port != last_port:
            print(f"📡 Detected DevTools active port: {port}")
            last_port = port
            consecutive_failures = 0
            # 端口变化时，重置所有缓存以确保能重新建立连接
            last_target_ws_url = None
            is_quota_injected = False
            
        try:
            response = urllib.request.urlopen(f"http://localhost:{port}/json", timeout=2.0)
            targets = json.loads(response.read().decode('utf-8'))
            consecutive_failures = 0
            
            target_ws_url = None
            target_title = ""
            target_url = ""
            
            # Priority 1: Match '/c/' or 'Greeting' or 'Project' or 'antigravity'
            for target in targets:
                title = target.get('title', '')
                type_ = target.get('type', '')
                url = target.get('url', '')
                
                if url.startswith('data:') or url.startswith('about:blank') or 'Loading' in title:
                    continue
                    
                if type_ == 'page' and ('Greeting' in title or 'Project' in title or 'antigravity' in url or '/c/' in url):
                    target_ws_url = target.get('webSocketDebuggerUrl')
                    target_title = title
                    target_url = url
                    break
                    
            # Priority 2: Fallback to any valid page
            if not target_ws_url:
                for target in targets:
                    title = target.get('title', '')
                    type_ = target.get('type', '')
                    url = target.get('url', '')
                    
                    if url.startswith('data:') or url.startswith('about:blank') or 'Loading' in title:
                        continue
                        
                    if type_ == 'page':
                        target_ws_url = target.get('webSocketDebuggerUrl')
                        target_title = title
                        target_url = url
                        break
                        
            if target_ws_url:
                path = target_ws_url.split(f"localhost:{port}")[1]
                
                # 检测 Target 是否发生重载/改变
                if target_ws_url != last_target_ws_url:
                    print(f"🔄 Target switched to: '{target_title}' ({target_url})")
                    last_target_ws_url = target_ws_url
                    is_quota_injected = False
                
                # 只有在未注入，或者每 5 次循环（25秒）的周期巡检时，才真正发起 CDP V8 状态查询
                should_detect = (not is_quota_injected) or (iteration_counter % 5 == 0)
                
                # 读取积分文件最后修改时间，避免无意义的高频 SQLite 数据库读取与磁盘 I/O
                current_mtime = 0
                import os
                if os.path.exists(db_path):
                    try:
                        current_mtime = os.path.getmtime(db_path)
                    except Exception:
                        pass
                
                # 检测积分是否确实变动，如变动则读取并准备同步到视口
                credits_changed = False
                credits_val = last_credits_val
                
                if current_mtime != last_db_mtime or last_credits_val == -1:
                    last_db_mtime = current_mtime
                    credits_val = get_credits_from_db()
                    if credits_val != last_credits_val:
                        last_credits_val = credits_val
                        credits_changed = True
                
                # 执行注入与状态检查逻辑
                if should_detect:
                    is_loaded = is_quota_loaded(port, path)
                    if not is_loaded:
                        print(f"⚡ Quota not active on '{target_title}' ({target_url}). Injecting quota.js...")
                        
                        # Read fresh quota.js code
                        try:
                            with open('/Users/yitao/.gemini/antigravity/scratch/antigravity2.0-quota-pluging/quota.js', 'r') as f:
                                js_code = f.read()
                                
                            # Set window.__antigravityCredits before running quota.js
                            update_credits_on_page(port, path, credits_val)
                            
                            success = inject_quota(port, path, js_code)
                            if success:
                                print(f"✨ Quota Progress Bar injection completed successfully!")
                                is_quota_injected = True
                            else:
                                print("⚠️ Quota injection failed.")
                        except Exception as e:
                            print(f"❌ Error reading/injecting quota.js: {e}")
                    else:
                        is_quota_injected = True
                        if credits_changed:
                            update_credits_on_page(port, path, credits_val)
                elif credits_changed:
                    # 在极静默周期中，仅在积分确实改变时才利用 CDP 更新积分全局变量，从而彻底阻断打字卡顿
                    update_credits_on_page(port, path, credits_val)
            
        except Exception as e:
            consecutive_failures += 1
            if consecutive_failures > 10:
                print(f"❌ Connection to DevTools failed consistently: {e}. Exiting daemon.")
                break
                
        iteration_counter += 1
        time.sleep(5)

if __name__ == "__main__":
    main()
