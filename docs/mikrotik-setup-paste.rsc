# EUNISET LOVE hotspot — paste-ready build for a freshly reset RouterOS 7 router.
# Edit the two CHANGE-ME passwords first. Paste one numbered block at a time
# and read the output before moving on. The fully commented version, for
# /import instead of pasting, is mikrotik-setup.rsc.

# 1 — identity and admin password
/system identity set name="EUNISET-LOVE-HOTSPOT"
/user set [find name=admin] password="CHANGE-ME-admin-password"

# 2 — bridge the LAN ports (check your port names with /interface print)
/interface bridge add name=bridge-hotspot
/interface bridge port add bridge=bridge-hotspot interface=ether2
/interface bridge port add bridge=bridge-hotspot interface=ether3
/interface bridge port add bridge=bridge-hotspot interface=ether4
/interface bridge port add bridge=bridge-hotspot interface=ether5

# 3 — WAN from Starlink
/ip dhcp-client add interface=ether1 disabled=no comment="Starlink WAN"

# 4 — LAN addressing (10.5.50.x avoids Starlink's own 192.168.1.x)
/ip address add address=10.5.50.1/24 interface=bridge-hotspot
/ip pool add name=hotspot-pool ranges=10.5.50.10-10.5.50.254
/ip dhcp-server add name=hotspot-dhcp interface=bridge-hotspot address-pool=hotspot-pool lease-time=1h disabled=no
/ip dhcp-server network add address=10.5.50.0/24 gateway=10.5.50.1 dns-server=10.5.50.1

# 5 — DNS and clock
/ip dns set servers=1.1.1.1,8.8.8.8 allow-remote-requests=yes
/system ntp client set enabled=yes
/system ntp client servers add address=time.cloudflare.com
/system clock set time-zone-name=Africa/Accra

# 6 — NAT
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade

# 7 — hotspot server
/ip hotspot profile add name=eunisetlove-profile hotspot-address=10.5.50.1 html-directory=hotspot login-by=http-pap use-radius=no
/ip hotspot add name=eunisetlove-hotspot interface=bridge-hotspot address-pool=hotspot-pool profile=eunisetlove-profile addresses-per-mac=1 idle-timeout=none keepalive-timeout=2m disabled=no

# 8 — the eight voucher profiles. These names must match the dashboard packages.
#     rate-limit is upload/download as the customer experiences it.
/ip hotspot user profile add name=VOUCHER-1H-1CODE shared-users=1 add-mac-cookie=no rate-limit="2M/5M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-3H-1CODE shared-users=1 add-mac-cookie=no rate-limit="2M/5M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-6H-1CODE shared-users=1 add-mac-cookie=no rate-limit="2M/5M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-12H-1CODE shared-users=1 add-mac-cookie=no rate-limit="2M/5M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-24H-1CODE shared-users=1 add-mac-cookie=no rate-limit="2M/5M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-1GB shared-users=1 add-mac-cookie=no rate-limit="3M/8M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-2GB shared-users=1 add-mac-cookie=no rate-limit="3M/8M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-5GB shared-users=1 add-mac-cookie=no rate-limit="4M/10M" status-autorefresh=1m

# 9 — the dashboard's API account, and turn off what is not used
/user group add name=voucher-api policy=api,read,write,test,winbox
/user add name=voucher-api group=voucher-api password="CHANGE-ME-api-password"
/ip service set api port=8728 disabled=no
/ip service set api-ssl port=8729 disabled=no
/ip service set telnet disabled=yes
/ip service set ftp disabled=yes
/ip service set www disabled=yes

# 10 — firewall
/ip firewall filter add chain=input action=accept connection-state=established,related
/ip firewall filter add chain=input action=drop connection-state=invalid
/ip firewall filter add chain=input action=accept protocol=icmp
/ip firewall filter add chain=input action=accept in-interface=bridge-hotspot protocol=udp dst-port=53
/ip firewall filter add chain=input action=accept in-interface=bridge-hotspot protocol=tcp dst-port=53
/ip firewall filter add chain=input action=accept in-interface=bridge-hotspot protocol=tcp dst-port=80,443
/ip firewall filter add chain=input action=accept in-interface=bridge-hotspot protocol=tcp dst-port=8728,8729 src-address=10.5.50.0/24
/ip firewall filter add chain=input action=accept in-interface=bridge-hotspot protocol=tcp dst-port=8291
/ip firewall filter add chain=input action=drop in-interface=ether1
/ip firewall filter add chain=forward action=accept connection-state=established,related
/ip firewall filter add chain=forward action=drop connection-state=invalid
/ip firewall filter add chain=forward action=drop connection-state=new in-interface=ether1

# 11 — test voucher
/ip hotspot user add name=TEST1234 password=TEST1234 profile=VOUCHER-1H-1CODE limit-uptime=1h

# 12 — verify, then delete the test voucher
# /ip address print
# /ip hotspot print
# /ip hotspot user profile print
# /ip service print
# /ip hotspot active print
# /ip hotspot user remove [find name=TEST1234]
