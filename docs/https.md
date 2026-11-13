# HTTPS on your home network

This guide gives Homeport a real, trusted HTTPS certificate on your home network, with nothing to install on phones or computers. You need HTTPS to install Homeport as an app on your phone.

Homeport keeps running in Docker. Two programs go on the host machine itself:

- **certbot** gets a free Let's Encrypt certificate by proving you own your domain through Cloudflare's DNS. Nothing on your network is opened to the internet.
- **nginx** serves HTTPS on port 443 and passes requests to Homeport (`127.0.0.1:3000`) and its storage (`127.0.0.1:9000`).

## Does this use my internet data?

Almost none. Your phone looks up the name (a few hundred bytes), gets your server's local address, and talks to it directly over your Wi-Fi. Uploads, downloads and streaming never leave your network. Renewing the certificate every 60–90 days takes well under 100 KB.

This only holds while the DNS records are set to **DNS only**. See step 2.

## 1. Give the server a fixed local address

Reserve an address for the server in your router, usually under "DHCP reservation" or "static lease". To see its current address:

| System | Command |
| --- | --- |
| Windows | `ipconfig` (look for "IPv4 Address") |
| macOS | `ipconfig getifaddr en0` |
| Linux | `hostname -I` |

The examples below use `192.168.1.2`, `home.example.com` for the app and `s3.home.example.com` for storage. Use your own address and names.

## 2. Add the DNS records in Cloudflare

In the Cloudflare dashboard, open your domain, go to **DNS → Records**, and add:

| Type | Name | IPv4 address | Proxy status |
| --- | --- | --- | --- |
| A | `home` | `192.168.1.2` | **DNS only** (grey cloud) |
| A | `s3.home` | `192.168.1.2` | **DNS only** (grey cloud) |

> [!WARNING]
> Click the orange cloud until it turns grey. **Proxied** (orange) would send all your traffic through Cloudflare's servers, using your internet data, and it can't reach a private address anyway.

## 3. Create a Cloudflare API token

1. Go to **My Profile → API Tokens → Create Token**.
2. Choose the **Edit zone DNS** template.
3. Under **Zone Resources**, select **Include → Specific zone → your domain**.
4. Create the token and copy it. Cloudflare shows it only once.

Save it in a file named `cloudflare.ini` that only you can read:

```ini
dns_cloudflare_api_token = paste-your-token-here
```

| System | Where to keep it | Lock it down |
| --- | --- | --- |
| Windows | `C:\Certbot\cloudflare.ini` | Already limited to administrators by the folder |
| macOS / Linux | `/etc/letsencrypt/cloudflare.ini` | `sudo chmod 600 /etc/letsencrypt/cloudflare.ini` |

## 4. Install certbot and nginx

**Windows**

1. Install [Python 3](https://www.python.org/downloads/windows/) (tick "Add python.exe to PATH").
2. In an **administrator** terminal:
   ```powershell
   py -m pip install --upgrade certbot certbot-dns-cloudflare
   ```
3. Download nginx for Windows from [nginx.org](https://nginx.org/en/download.html) (the "Stable version" zip) and unzip it to `C:\nginx`.

Certbot no longer ships a Windows installer, but the Python package works. Run certbot from an administrator terminal, because it saves certificates under `C:\Certbot`.

**macOS** (with [Homebrew](https://brew.sh))

```sh
brew install nginx pipx
sudo pipx install --global certbot
sudo pipx inject --global certbot certbot-dns-cloudflare
```

**Linux** (Debian or Ubuntu; other distributions have the same packages)

```sh
sudo apt install nginx certbot python3-certbot-dns-cloudflare
```

## 5. Get the certificate

Run this once. It's the same everywhere apart from the path to `cloudflare.ini`. Use `sudo` on macOS and Linux, and an administrator terminal on Windows.

```sh
certbot certonly --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini --dns-cloudflare-propagation-seconds 30 --cert-name homeport -d home.example.com -d s3.home.example.com --deploy-hook "nginx -s reload"
```

The `--deploy-hook` reloads nginx after each renewal, and certbot remembers it. Adjust two parts for your system:

| System | `--dns-cloudflare-credentials` | `--deploy-hook` |
| --- | --- | --- |
| Windows | `C:\Certbot\cloudflare.ini` | `"C:\nginx\nginx.exe -p C:\nginx -s reload"` |
| macOS | `/etc/letsencrypt/cloudflare.ini` | `"$(brew --prefix)/bin/nginx -s reload"` |
| Linux | `/etc/letsencrypt/cloudflare.ini` | `"systemctl reload nginx"` |

When it finishes, it prints where the certificate was saved:

| System | Certificate folder |
| --- | --- |
| Windows | `C:/Certbot/live/homeport/` |
| macOS / Linux | `/etc/letsencrypt/live/homeport/` |

## 6. Configure nginx

Copy [`deploy/nginx/homeport.conf`](../deploy/nginx/homeport.conf) to nginx's config folder, then edit the copy:

- Replace `home.example.com` and `s3.home.example.com` with your names.
- On Windows, change the four certificate paths to `C:/Certbot/live/homeport/fullchain.pem` and `C:/Certbot/live/homeport/privkey.pem`. Use forward slashes.

| System | Copy it to | Then |
| --- | --- | --- |
| Windows | `C:\nginx\conf\homeport.conf` | In `C:\nginx\conf\nginx.conf`, inside the `http { … }` block, add `include homeport.conf;` and delete the sample `server { … }` block that listens on port 80 |
| macOS | `$(brew --prefix)/etc/nginx/servers/homeport.conf` | Nothing; Homebrew's nginx loads that folder |
| Linux | `/etc/nginx/conf.d/homeport.conf` | Nothing; nginx loads that folder |

Check the config, then start nginx:

| System | Check | Start |
| --- | --- | --- |
| Windows | `C:\nginx\nginx.exe -p C:\nginx -t` | `start C:\nginx\nginx.exe -p C:\nginx` |
| macOS | `nginx -t` | `sudo brew services start nginx` |
| Linux | `sudo nginx -t` | `sudo systemctl enable --now nginx` |

On Windows, let other devices reach nginx. Otherwise Windows Firewall blocks every device on your network except the host itself: they hang until "site can't be reached", while the host keeps working. In an administrator PowerShell, mark your home network as Private, then allow nginx from your local network only:

```powershell
Set-NetConnectionProfile -InterfaceAlias "Ethernet" -NetworkCategory Private
New-NetFirewallRule -DisplayName "Homeport HTTPS (nginx)" -Direction Inbound -Action Allow -Program "C:\nginx\nginx.exe" -Protocol TCP -LocalPort 80,443 -RemoteAddress LocalSubnet -Profile Private
```

Use `Get-NetConnectionProfile` to find your adapter's name (for example `Wi-Fi`). macOS and Linux don't block it by default. If you've turned on a firewall such as `ufw`, allow ports 80 and 443 from your LAN.

To start nginx automatically at boot, run this once in an administrator PowerShell:

```powershell
Register-ScheduledTask -TaskName "nginx" -User "NT AUTHORITY\SYSTEM" -RunLevel Highest `
  -Trigger (New-ScheduledTaskTrigger -AtStartup) `
  -Action (New-ScheduledTaskAction -Execute "C:\nginx\nginx.exe" -Argument "-p C:\nginx" -WorkingDirectory "C:\nginx")
```

## 7. Point Homeport at HTTPS

Add these lines to Homeport's `.env`:

```ini
S3_PUBLIC_ENDPOINT=https://s3.home.example.com
LAN_URLS=https://home.example.com
PUBLISH_ADDRESS=127.0.0.1
TRUST_PROXY=uniquelocal
```

- `S3_PUBLIC_ENDPOINT` makes uploads and streams use HTTPS too. Without it, browsers block them as mixed content.
- `PUBLISH_ADDRESS=127.0.0.1` makes ports 3000 and 9000 reachable only from the host itself, so everyone goes through nginx.
- `TRUST_PROXY=uniquelocal` lets Homeport read each visitor's real address and the HTTPS flag from nginx. Docker presents nginx's connections from a private `172.x` address.

> [!IMPORTANT]
> Set `TRUST_PROXY` only together with `PUBLISH_ADDRESS=127.0.0.1`. If the ports stayed open to your network, other devices could pretend to be the proxy.

Then restart Homeport:

```sh
docker compose up -d
```

Open `https://home.example.com`, sign in, go to **Account → Install app**, and add Homeport to your phone.

## 8. Renew automatically

Let's Encrypt certificates last 90 days. Run `certbot renew` daily: it only renews when the certificate is within 30 days of expiring, and then reloads nginx with the hook from step 5. Scheduled tasks don't see your terminal's PATH, so use certbot's full path. Find it with `where certbot` on Windows or `which certbot` on macOS.

| System | Set it up |
| --- | --- |
| Windows | In an administrator PowerShell, run the command below, using the path from `where.exe certbot` |
| macOS | `sudo crontab -e`, then add: `0 3 * * * /full/path/to/certbot renew --quiet` |
| Linux | Nothing to do: the `certbot` package already renews twice a day |

```powershell
Register-ScheduledTask -TaskName "Homeport certificate" -User "NT AUTHORITY\SYSTEM" -RunLevel Highest `
  -Trigger (New-ScheduledTaskTrigger -Daily -At 3am) `
  -Action (New-ScheduledTaskAction -Execute "C:\Program Files\Python313\Scripts\certbot.exe" -Argument "renew --quiet")
```

To test renewal without changing anything: `certbot renew --dry-run` (with `sudo` or as administrator).

## Checking it

- `nslookup home.example.com` on any device should answer `192.168.1.2`.
- The browser shows a padlock, with no warnings.
- Your router's internet traffic counter shouldn't move while you stream a video.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| The name doesn't resolve at home, but works with mobile data | Your router blocks public DNS answers that point to private addresses ("DNS rebinding protection"). Allow your domain in the router, or add `home.example.com → 192.168.1.2` to the router's local DNS |
| certbot reports an authentication error | Check that the token uses the **Edit zone DNS** template and includes this domain |
| Uploads or videos fail after switching to HTTPS | Check `S3_PUBLIC_ENDPOINT` uses `https://` and your storage name, then run `docker compose up -d` |
| nginx won't start: port 80 or 443 in use | On Windows, check with `netstat -ano \| findstr :443`, then stop that program. On macOS or Linux, use `sudo lsof -i :443` |
| Works on the host, but other devices on the network hang, then show "site can't be reached" | Windows Firewall is dropping the connection. Add the firewall rule from step 6, and check that the network is Private with `Get-NetConnectionProfile` |
| `could not build server_names_hash` | Your names are long. Add `server_names_hash_bucket_size 64;` inside the `http { … }` block of `nginx.conf` |
| `502 Bad Gateway` | Homeport isn't running, or isn't published on `127.0.0.1:3000`. Run `docker compose ps` |
| Every sign-in shows the same address, or lockouts hit everyone | `TRUST_PROXY` is missing. Add it as in step 7 |
