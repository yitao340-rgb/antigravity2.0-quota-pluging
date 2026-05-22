import socket
import json
import struct
import urllib.request
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

def main():
    try:
        with open('/Users/yitao/Library/Application Support/Antigravity/DevToolsActivePort', 'r') as f:
            port = int(f.readline().strip())
    except Exception as e:
        print(f"❌ Failed to read DevToolsActivePort: {e}")
        return

    print(f"📡 Connecting to DevTools active port: {port}")

    try:
        response = urllib.request.urlopen(f"http://localhost:{port}/json")
        targets = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"❌ Failed to query targets: {e}")
        return

    target_ws_url = None
    for target in targets:
        title = target.get('title', '')
        type_ = target.get('type', '')
        if type_ == 'page' and ('Greeting' in title or 'Project' in title or 'antigravity' in target.get('url', '')):
            target_ws_url = target.get('webSocketDebuggerUrl')
            break
            
    if not target_ws_url:
        for target in targets:
            if target.get('type') == 'page':
                target_ws_url = target.get('webSocketDebuggerUrl')
                break
                
    if not target_ws_url:
        print("❌ No valid targets found")
        return
        
    print(f"🎯 Target debugger found: {target_ws_url}")
    path = target_ws_url.split(f"localhost:{port}")[1]

    # JS code to stop the quota plugin and clean up all states
    cleanup_js = """
    (() => {
        let stopped = false;
        if (typeof window.__antigravityStopQuota === 'function') {
            try {
                window.__antigravityStopQuota();
                stopped = true;
            } catch(e) {
                console.error("Error stopping quota plugin:", e);
            }
        }
        
        // Remove pill if it still exists
        const pill = document.getElementById('antigravity-quota-pill');
        if (pill) {
            pill.remove();
        }
        
        // Clean up global variables
        delete window.__antigravityStopQuota;
        delete window.__antigravityQuotaLauncher;
        delete window.__antigravityQuotaObserver;
        delete window.__antigravityQuotaTimeout;
        delete window.__antigravityQuotaInterval;
        
        return JSON.stringify({
            success: true,
            stopped: stopped,
            pillRemoved: !document.getElementById('antigravity-quota-pill')
        });
    })()
    """

    # Connect & execute cleanup
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(3.0)
    try:
        s.connect(('localhost', port))
        
        # Handshake
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

        # Send CDP evaluate request (Cleanup)
        payload = json.dumps({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": cleanup_js,
                "returnByValue": True
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
            
        frame.extend([0, 0, 0, 0])
        frame.extend(payload_bytes)
        s.sendall(frame)
        s.recv(65536)
        s.close()
        print("✅ Cleanup of old Quota Plugin completed successfully.")
            
    except Exception as e:
        print(f"❌ Cleanup failed: {e}")
        try:
            s.close()
        except:
            pass

    # Read the fresh quota.js
    try:
        with open('/Users/yitao/.gemini/antigravity/scratch/antigravity2.0-quota-pluging/quota.js', 'r') as f:
            quota_code = f.read()
    except Exception as e:
        print(f"❌ Failed to read quota.js: {e}")
        return

    # Fetch fresh credits
    credits_val = get_credits_from_db()
    print(f"💎 Current AI Credits read from SQLite: {credits_val}")

    # Inject credits & quota.js
    injection_code = f"""
    (() => {{
        window.__antigravityCredits = {credits_val};
        {quota_code}
        return "reloaded";
    }})()
    """

    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(3.0)
    try:
        s.connect(('localhost', port))
        
        # Handshake
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

        # Send CDP evaluate request (Reload)
        payload = json.dumps({
            "id": 2,
            "method": "Runtime.evaluate",
            "params": {
                "expression": injection_code,
                "returnByValue": True
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
            
        frame.extend([0, 0, 0, 0])
        frame.extend(payload_bytes)
        s.sendall(frame)
        
        data = s.recv(65536)
        s.close()
        
        json_start = data.find(b'{"id"')
        if json_start != -1:
            json_str = data[json_start:].decode('utf-8', errors='ignore')
            json_end = json_str.rfind('}')
            if json_end != -1:
                json_str = json_str[:json_end+1]
            res = json.loads(json_str)
            result_val = res.get('result', {}).get('result', {}).get('value')
            if result_val == "reloaded":
                print("✨ Quota Progress Bar Plugin has been successfully reloaded on the active page!")
            else:
                print("⚠️ Reload result details:", res)
        else:
            print("❌ Invalid response format during injection.")
            
    except Exception as e:
        print(f"❌ Reload injection failed: {e}")
        try:
            s.close()
        except:
            pass

if __name__ == "__main__":
    main()
