# =============================================================================
#  EUNISET LOVE — MikroTik hotspot build from a factory reset
#  Starlink -> MikroTik -> outdoor access point(s) -> customers
#
#  RouterOS 7.x. Most of this also works on 6.x; the two places that differ
#  are marked "v6 note".
#
#  BEFORE YOU RESET, READ THIS
#  ---------------------------
#  A reset erases every hotspot user on the router. That is your entire
#  voucher stock. Export it first and copy the file off the router:
#
#      /ip hotspot user export file=vouchers
#      (Winbox -> Files -> drag vouchers.rsc to your computer, and a USB stick)
#
#  HOW TO RUN THIS
#  ---------------
#  1. Reset:      /system reset-configuration no-defaults=yes skip-backup=yes
#     The router reboots with NO addresses at all. Reconnect with Winbox by
#     MAC address (the Neighbors tab), not by IP -- there will be no IP yet.
#  2. Upload this file: Winbox -> Files -> drag mikrotik-setup.rsc in.
#  3. Run it:     /import file-name=mikrotik-setup.rsc
#
#  Or paste it into a terminal in sections. If you paste, do it section by
#  section and read the output -- a single failed line is easy to miss in a
#  wall of text.
#
#  EDIT THESE BEFORE RUNNING
#  -------------------------
#  Search for CHANGE-ME. There are four: the router admin password, the
#  API password, the WiFi/hotspot name, and the LAN subnet if 10.5.50.0/24
#  clashes with anything you already use.
# =============================================================================


# -----------------------------------------------------------------------------
# 1. Identity and the admin password
# -----------------------------------------------------------------------------
/system identity set name="EUNISET-LOVE-HOTSPOT"

# The default admin has no password after a reset. Set one immediately.
/user set [find name=admin] password="CHANGE-ME-admin-password"


# -----------------------------------------------------------------------------
# 2. Interfaces
#
#    ether1 = the cable from Starlink
#    ether2+ and any wireless = the LAN the access points sit on
#
#    Check your own port names first with:  /interface print
#    A 5-port router is assumed below; adjust the ether2..ether5 lines if
#    yours has a different number of ports.
# -----------------------------------------------------------------------------
/interface bridge
add name=bridge-hotspot comment="LAN for access points and customers"

/interface bridge port
add bridge=bridge-hotspot interface=ether2
add bridge=bridge-hotspot interface=ether3
add bridge=bridge-hotspot interface=ether4
add bridge=bridge-hotspot interface=ether5

# If this router has built-in WiFi, uncomment ONE of these.
# v6 note: RouterOS 6 and 7 with the legacy driver use /interface wireless.
#/interface bridge port add bridge=bridge-hotspot interface=wlan1
# RouterOS 7 with the wifi (wifiwave2) driver:
#/interface bridge port add bridge=bridge-hotspot interface=wifi1


# -----------------------------------------------------------------------------
# 3. WAN — get an address from Starlink by DHCP
# -----------------------------------------------------------------------------
/ip dhcp-client
add interface=ether1 disabled=no comment="Starlink WAN"


# -----------------------------------------------------------------------------
# 4. LAN addressing
#
#    10.5.50.0/24 is used deliberately: Starlink's own router hands out
#    192.168.1.0/24, so using that here would collide.
# -----------------------------------------------------------------------------
/ip address
add address=10.5.50.1/24 interface=bridge-hotspot comment="hotspot gateway"

/ip pool
add name=hotspot-pool ranges=10.5.50.10-10.5.50.254

/ip dhcp-server
add name=hotspot-dhcp interface=bridge-hotspot address-pool=hotspot-pool \
    lease-time=1h disabled=no
/ip dhcp-server network
add address=10.5.50.0/24 gateway=10.5.50.1 dns-server=10.5.50.1 comment="hotspot clients"


# -----------------------------------------------------------------------------
# 5. DNS and time
#
#    The clock matters: without it, log timestamps and any date-based report
#    are meaningless. Uptime limits themselves do not depend on it.
# -----------------------------------------------------------------------------
/ip dns set servers=1.1.1.1,8.8.8.8 allow-remote-requests=yes

/system ntp client set enabled=yes
# v6 note: on RouterOS 6 use
#   /system ntp client set enabled=yes primary-ntp=216.239.35.0
/system ntp client servers add address=time.cloudflare.com
/system clock set time-zone-name=Africa/Accra


# -----------------------------------------------------------------------------
# 6. NAT — let customers reach the internet through Starlink
# -----------------------------------------------------------------------------
/ip firewall nat
add chain=srcnat out-interface=ether1 action=masquerade comment="hotspot to Starlink"


# -----------------------------------------------------------------------------
# 7. Hotspot server
# -----------------------------------------------------------------------------
/ip hotspot profile
add name=eunisetlove-profile hotspot-address=10.5.50.1 \
    \
    html-directory=hotspot login-by=http-pap \
    use-radius=no \
    comment="CHANGE-ME if you want a different login page address"

/ip hotspot
add name=eunisetlove-hotspot interface=bridge-hotspot \
    address-pool=hotspot-pool profile=eunisetlove-profile \
    addresses-per-mac=1 idle-timeout=5m keepalive-timeout=none disabled=no


# -----------------------------------------------------------------------------
# 8. Voucher profiles
#
#    THE NAMES BELOW MUST MATCH THE PACKAGES IN THE DASHBOARD EXACTLY.
#    Change one here and you must change it there too, or generated vouchers
#    will be pushed with a profile the router does not have.
#
#    rate-limit is rx-rate/tx-rate as seen from the CLIENT:
#        rx = the customer's UPLOAD speed
#        tx = the customer's DOWNLOAD speed
#    Adjust these to what your Starlink link can actually carry, divided by
#    roughly how many people you expect online at once.
#
#    shared-users=1 means one voucher, one device at a time -- which is what
#    the "1CODE" in the names refers to.
#
#    Accounting is left on. The dashboard reads bytes-in, bytes-out and
#    uptime from these counters; turn accounting off and usage reporting
#    becomes impossible, not merely empty.
# -----------------------------------------------------------------------------
/ip hotspot user profile

add name=VOUCHER-1H-1CODE   shared-users=1 add-mac-cookie=no rate-limit="2M/5M"  status-autorefresh=1m
add name=VOUCHER-3H-1CODE   shared-users=1 add-mac-cookie=no rate-limit="2M/5M"  status-autorefresh=1m
add name=VOUCHER-6H-1CODE   shared-users=1 add-mac-cookie=no rate-limit="2M/5M"  status-autorefresh=1m
add name=VOUCHER-12H-1CODE  shared-users=1 add-mac-cookie=no rate-limit="2M/5M"  status-autorefresh=1m
add name=VOUCHER-24H-1CODE  shared-users=1 add-mac-cookie=no rate-limit="2M/5M"  status-autorefresh=1m

# Data-limited plans. The byte allowance lives on each voucher
# (limit-bytes-total), not on the profile, so the dashboard can set it.
add name=VOUCHER-1GB        shared-users=1 add-mac-cookie=no rate-limit="3M/8M"  status-autorefresh=1m
add name=VOUCHER-2GB        shared-users=1 add-mac-cookie=no rate-limit="3M/8M"  status-autorefresh=1m
add name=VOUCHER-5GB        shared-users=1 add-mac-cookie=no rate-limit="4M/10M" status-autorefresh=1m


# -----------------------------------------------------------------------------
# 9. The API account the dashboard signs in with
#
#    A dedicated account, not admin: it can manage the hotspot and nothing
#    else, and you can revoke it without touching your own login.
# -----------------------------------------------------------------------------
/user group
add name=voucher-api policy=api,read,write,test,winbox \
    comment="for the EUNISET LOVE dashboard"

/user
add name=voucher-api group=voucher-api password="CHANGE-ME-api-password" \
    comment="dashboard API account"

/ip service
set api port=8728 disabled=no
set api-ssl port=8729 disabled=no

# Turn off what you are not using. Leave winbox enabled or you lose your way in.
/ip service
set telnet disabled=yes
set ftp disabled=yes
set www disabled=yes


# -----------------------------------------------------------------------------
# 10. Firewall
#
#     Customers reach the internet and the login page, and nothing else on
#     the router. The API is reachable from the LAN only -- change that only
#     if you later have a public IP, and then restrict it by source address
#     rather than opening it to everyone.
# -----------------------------------------------------------------------------
/ip firewall filter

add chain=input action=accept connection-state=established,related \
    comment="keep existing conversations"
add chain=input action=drop connection-state=invalid

add chain=input action=accept protocol=icmp comment="ping"

add chain=input action=accept in-interface=bridge-hotspot protocol=udp dst-port=53 \
    comment="DNS for customers"
add chain=input action=accept in-interface=bridge-hotspot protocol=tcp dst-port=53
add chain=input action=accept in-interface=bridge-hotspot protocol=tcp dst-port=80,443 \
    comment="hotspot login page"

add chain=input action=accept in-interface=bridge-hotspot protocol=tcp dst-port=8728,8729 \
    src-address=10.5.50.0/24 comment="API, from the local network only"
add chain=input action=accept in-interface=bridge-hotspot protocol=tcp dst-port=8291 \
    comment="Winbox from the LAN"

add chain=input action=drop in-interface=ether1 comment="nothing unsolicited from the WAN"

add chain=forward action=accept connection-state=established,related
add chain=forward action=drop connection-state=invalid
add chain=forward action=drop connection-state=new in-interface=ether1 \
    comment="no inbound sessions from the internet"



# -----------------------------------------------------------------------------
# 12. A test voucher, so you can confirm the hotspot works before importing
#     anything. Delete it once you have checked it.
# -----------------------------------------------------------------------------
/ip hotspot user
add name=TEST1234 password=TEST1234 profile=VOUCHER-1H-1CODE limit-uptime=1h \
    comment="delete me after testing"


# =============================================================================
#  AFTER RUNNING
#
#  1. Check it came up:
#         /ip address print
#         /ip hotspot print
#         /ip hotspot user profile print
#         /ip service print
#
#  2. Connect a phone to the access point. A login page should appear.
#     Sign in with TEST1234 / TEST1234 and confirm you get internet.
#
#  3. Confirm the session is being accounted for:
#         /ip hotspot active print
#
#  4. Delete the test voucher:
#         /ip hotspot user remove [find name=TEST1234]
#
#  5. Import your old stock, if you exported it:
#         /import file-name=vouchers.rsc
#     Or upload vouchers.rsc to the dashboard instead, which checks it for
#     duplicates and bad lines before writing anything.
#
#  6. In the dashboard: Routers -> Add router
#         Host      10.5.50.1   (or whatever this router's LAN address is)
#         Port      8728
#         Username  voucher-api
#         Password  the one you set above
#     Then press Test. This only works from a machine that can reach the
#     router -- on Starlink's CGNAT, an internet-hosted dashboard cannot.
# =============================================================================
