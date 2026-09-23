# Reaching the MikroTik from the dashboard

Your dashboard runs on Render, on the public internet. Your MikroTik sits behind
Starlink, which uses CGNAT: the router can reach out, but nothing can reach in.
There is no address for Render to dial. That is why Active Users, Sync, Push and
Pull have shown the router offline since the day it was deployed.

This is not a setting anyone missed. It is how the connection works, and the
only real fix is to give the router a public address of its own.

```
  MikroTik  ──outbound WireGuard tunnel──▶  VPS (public IP)  ◀──API──  Render
  10.10.0.2                                  10.10.0.1
  behind CGNAT                               reachable by anyone
```

The MikroTik dials *out* to the VPS, which CGNAT allows. The tunnel stays open.
Render then talks to the VPS, and the VPS passes it down the tunnel. The router
never needs an inbound address of its own.

---

## What to buy

Any small Linux VPS with a public IPv4 address. The cheapest tier is plenty --
this machine forwards a trickle of API traffic and nothing else. Expect roughly
**$4-6/month**; check current prices yourself, they move.

Providers people use for this: **Hetzner**, **DigitalOcean**, **Vultr**,
**Contabo**. Any of them is fine.

Two choices when you create it:

- **Image**: Ubuntu 24.04 LTS (or 22.04). The commands below assume Ubuntu.
- **Region**: closer to Ghana is better. A European region (Germany, UK) or
  Vultr's Johannesburg are reasonable. This only affects how quickly the
  dashboard feels, not whether it works.

Write down the **public IP address** it gives you. It appears throughout as
`VPS_IP`.

---

## Part 1 — On the VPS

SSH in as root, then:

```bash
apt update && apt install -y wireguard
```

Generate the VPS's keys:

```bash
cd /etc/wireguard
umask 077
wg genkey | tee vps-private.key | wg pubkey > vps-public.key
cat vps-private.key    # VPS_PRIVATE
cat vps-public.key     # VPS_PUBLIC
```

Generate the router's keys here too -- easier than doing it on RouterOS:

```bash
wg genkey | tee router-private.key | wg pubkey > router-public.key
cat router-private.key   # ROUTER_PRIVATE
cat router-public.key    # ROUTER_PUBLIC
```

Keep all four values somewhere safe. The two private keys are secrets: anyone
holding them can join your tunnel.

Create `/etc/wireguard/wg0.conf`, substituting the values:

```ini
[Interface]
Address = 10.10.0.1/24
ListenPort = 51820
PrivateKey = VPS_PRIVATE

[Peer]
# The MikroTik
PublicKey = ROUTER_PUBLIC
AllowedIPs = 10.10.0.2/32
```

Start it and have it come back after a reboot:

```bash
systemctl enable --now wg-quick@wg0
wg show
```

### Forward the API port down the tunnel

Render cannot join the tunnel, so the VPS accepts the API connection on its
public address and forwards it to the router at `10.10.0.2:8728`.

```bash
echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/99-wireguard.conf
sysctl --system

apt install -y iptables-persistent

iptables -t nat -A PREROUTING -p tcp --dport 8728 -j DNAT --to-destination 10.10.0.2:8728
iptables -t nat -A POSTROUTING -d 10.10.0.2 -p tcp --dport 8728 -j MASQUERADE
```

### Lock that port down

**Do not skip this.** Port 8728 is now open to the whole internet, and behind it
is your router's API. Anyone who finds it can try passwords against it all day.

Render gives each service a small set of fixed outbound IP addresses. Find yours
in the Render dashboard under your service's settings (look for outbound or
static IPs), then allow only those:

```bash
# Repeat for each Render outbound IP
iptables -I INPUT -p tcp --dport 8728 -s RENDER_IP_1 -j ACCEPT
iptables -I INPUT -p tcp --dport 8728 -s RENDER_IP_2 -j ACCEPT

# Then refuse everyone else
iptables -A INPUT -p tcp --dport 8728 -j DROP

netfilter-persistent save
```

Order matters: the ACCEPT rules are inserted at the top with `-I`, the DROP is
appended at the bottom with `-A`. Save, or it all disappears on reboot.

---

## Part 2 — On the MikroTik

RouterOS 7 has WireGuard built in. In the WinBox terminal:

```
/interface wireguard
add name=wg-vps listen-port=51820 private-key="ROUTER_PRIVATE"

/ip address
add address=10.10.0.2/24 interface=wg-vps

/interface wireguard peers
add interface=wg-vps public-key="VPS_PUBLIC" endpoint-address=VPS_IP \
    endpoint-port=51820 allowed-address=10.10.0.0/24 persistent-keepalive=25s
```

`persistent-keepalive=25s` is the setting that makes this work through CGNAT.
Without it the tunnel goes quiet, the carrier forgets the connection, and the
VPS can no longer reach down it. With it the router sends a small packet every
25 seconds and the path stays open.

Turn on the API service and let it through the firewall, but only from the
tunnel:

```
/ip service set api disabled=no port=8728

/ip firewall filter
add chain=input action=accept protocol=tcp dst-port=8728 src-address=10.10.0.1 \
    comment="API from VPS over WireGuard" place-before=0
```

`place-before=0` puts it at the top, above the drop rules the build script
installed. Without that it never matches.

Check the tunnel is up:

```
/interface wireguard peers print
```

You want a recent `last-handshake`. If it stays empty, the router is not
reaching the VPS -- check `VPS_IP`, that port 51820/UDP is open in your
provider's firewall, and that the keys are not swapped.

---

## Part 3 — A user for the dashboard

Do not give the dashboard your admin login. Make it its own account, limited to
what it needs:

```
/user group add name=api-group policy=api,read,write,test
/user add name=dashboard group=api-group password="CHOOSE_A_LONG_PASSWORD"
```

Pick something long and random. It goes into Render, not into a phone or a
notebook.

---

## Part 4 — Point the dashboard at it

In the dashboard, under Routers, edit your router:

- **Host**: `VPS_IP` (the VPS, not the MikroTik -- the VPS is the door)
- **Port**: `8728`
- **Username**: `dashboard`
- **Password**: the one you just chose

Save, then use Test Connection.

The app stores this password encrypted with `ROUTER_SECRET_KEY`, and it is never
sent to the browser -- all MikroTik traffic goes through the backend, as it has
from the start.

---

## Checking it worked

1. On the VPS: `wg show` lists the peer with a recent handshake.
2. On the VPS: `ping 10.10.0.2` reaches the router.
3. In the dashboard: Test Connection succeeds.
4. Active Users shows people who are logged in right now.
5. Sync, Push vouchers and Pull vouchers all work.

If 1 and 2 pass but the dashboard still fails, the tunnel is fine and the
problem is the API: check `/ip service print` shows api enabled, and that the
firewall rule really is above the drops (`/ip firewall filter print`).

---

## What this costs and what it gives you

About $5 a month, for: live user counts, syncing voucher state from the router,
pushing new batches to it without WinBox, and pulling router-side vouchers into
the system. Every feature that has been greyed out since deployment.

It also survives a reboot at either end and reconnects by itself, so once it is
up you should not have to think about it again.
