# =============================================================================
#  EUNISET LOVE — complete hotspot build for an EMPTY MikroTik
#  Starlink -> MikroTik -> access point(s) / built-in WiFi -> customers
#
#  For a router with no configuration on it. Nothing here deletes anything,
#  so it is safe to run on a blank or freshly reset router.
#
#  Change the two passwords in block 1 and block 9, then paste block by block.
#  Everything else adapts itself -- the port count is detected rather than
#  assumed, so this works on a 3-port, 5-port or 10-port router unchanged.
# =============================================================================


# ---- 1 -- identity and the admin password -----------------------------------
/system identity set name="EUNISET-LOVE-HOTSPOT"
/user set [find name=admin] password="CHANGE-ME-admin-password"


# ---- 2 -- bridge every LAN port ---------------------------------------------
# ether1 is left out: that is the Starlink side. Every other ethernet port is
# added automatically, whatever the router has, so no port list to edit.
/interface bridge add name=bridge-hotspot comment="hotspot LAN"

:foreach i in=[/interface ethernet find] do={
  :local portName [/interface ethernet get $i name];
  :if ($portName != "ether1") do={
    /interface bridge port add bridge=bridge-hotspot interface=$portName;
    :put ("bridged: " . $portName);
  }
}


# ---- 3 -- WAN: take an address from Starlink --------------------------------
/ip dhcp-client add interface=ether1 disabled=no comment="Starlink WAN"


# ---- 4 -- LAN addressing ----------------------------------------------------
# 10.5.50.x on purpose: Starlink's own router uses 192.168.1.x and would clash.
/ip address add address=10.5.50.1/24 interface=bridge-hotspot
/ip pool add name=hotspot-pool ranges=10.5.50.10-10.5.50.254
/ip dhcp-server add name=hotspot-dhcp interface=bridge-hotspot address-pool=hotspot-pool lease-time=1h disabled=no
/ip dhcp-server network add address=10.5.50.0/24 gateway=10.5.50.1 dns-server=10.5.50.1


# ---- 5 -- DNS and clock -----------------------------------------------------
/ip dns set servers=1.1.1.1,8.8.8.8 allow-remote-requests=yes
/system ntp client set enabled=yes
/system ntp client servers add address=time.cloudflare.com
/system clock set time-zone-name=Africa/Accra


# ---- 6 -- NAT ---------------------------------------------------------------
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade


# ---- 7 -- hotspot server ----------------------------------------------------
/ip hotspot profile add name=eunisetlove-profile hotspot-address=10.5.50.1 dns-name="login.eunisetlove.local" html-directory=hotspot login-by=http-chap,http-pap use-radius=no
/ip hotspot add name=eunisetlove-hotspot interface=bridge-hotspot address-pool=hotspot-pool profile=eunisetlove-profile addresses-per-mac=1 idle-timeout=5m keepalive-timeout=none disabled=no


# ---- 8 -- the eight voucher profiles ----------------------------------------
# These names must match the packages in the dashboard exactly.
# rate-limit is upload/download as the customer experiences it. Tune to what
# your Starlink link carries, divided by expected simultaneous users.
/ip hotspot user profile add name=VOUCHER-1H-1CODE shared-users=1 add-mac-cookie=no rate-limit="2M/5M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-3H-1CODE shared-users=1 add-mac-cookie=no rate-limit="2M/5M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-6H-1CODE shared-users=1 add-mac-cookie=no rate-limit="2M/5M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-12H-1CODE shared-users=1 add-mac-cookie=no rate-limit="2M/5M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-24H-1CODE shared-users=1 add-mac-cookie=no rate-limit="2M/5M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-1GB shared-users=1 add-mac-cookie=no rate-limit="3M/8M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-2GB shared-users=1 add-mac-cookie=no rate-limit="3M/8M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-5GB shared-users=1 add-mac-cookie=no rate-limit="4M/10M" status-autorefresh=1m


# ---- 9 -- the dashboard's API account ---------------------------------------
/user group add name=voucher-api policy=api,read,write,test,winbox
/user add name=voucher-api group=voucher-api password="CHANGE-ME-api-password"
/ip service set api port=8728 disabled=no
/ip service set api-ssl port=8729 disabled=no
/ip service set telnet disabled=yes
/ip service set ftp disabled=yes
/ip service set www disabled=yes


# ---- 10 -- firewall ---------------------------------------------------------
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


# ---- 11 -- walled garden and a test voucher ---------------------------------
/ip hotspot walled-garden add dst-host=login.eunisetlove.local
/ip hotspot user add name=TEST1234 password=TEST1234 profile=VOUCHER-1H-1CODE limit-uptime=1h


# =============================================================================
#  12 -- WiFi. RUN ONLY THE BLOCK THAT MATCHES YOUR ROUTER.
#
#  Find out which you have first:
#
#      /interface print
#
#  Then look at the names in the list:
#
#    * you see "wlan1"            -> the router has WiFi on the older driver
#                                    (hAP ac2, hAP lite, most RouterOS 6 gear)
#                                    -> run block 12A
#    * you see "wifi1"            -> WiFi on the newer RouterOS 7 driver
#                                    (hAP ax series)
#                                    -> run block 12B
#    * you see neither            -> no built-in WiFi. Your outdoor access
#                                    point provides the signal; nothing to do.
#                                    -> skip to VERIFY
# =============================================================================

# ---- 12A -- older wireless driver (wlan1) -----------------------------------
# /interface wireless security-profiles add name=hotspot-open mode=none
# /interface wireless set [find default-name=wlan1] ssid="EUNISET LOVE" mode=ap-bridge band=2ghz-b/g/n channel-width=20/40mhz-Ce security-profile=hotspot-open disabled=no
# /interface bridge port add bridge=bridge-hotspot interface=wlan1

# ---- 12B -- newer RouterOS 7 driver (wifi1) ---------------------------------
# /interface wifi security add name=hotspot-open authentication-types=""
# /interface wifi configuration add name=hotspot-cfg ssid="EUNISET LOVE" security=hotspot-open mode=ap
# /interface wifi set [find default-name=wifi1] configuration=hotspot-cfg disabled=no
# /interface bridge port add bridge=bridge-hotspot interface=wifi1

# The WiFi is deliberately OPEN -- no WiFi password. Customers connect freely,
# then the hotspot login page asks for their voucher. Putting a WPA password on
# top would mean telling every customer two secrets instead of one.


# =============================================================================
#  VERIFY — run these and read the output
# =============================================================================
# /interface print
# /ip address print
# /ip hotspot print
# /ip hotspot user profile print
# /ip service print
#
#  Expect: an address on ether1 from Starlink, 10.5.50.1 on bridge-hotspot,
#  one hotspot server running, EIGHT voucher profiles, api enabled on 8728.
#
#  Then connect a phone, sign in with TEST1234 / TEST1234, confirm internet,
#  check the session is counted, and remove the test voucher:
#
# /ip hotspot active print
# /ip hotspot user remove [find name=TEST1234]
