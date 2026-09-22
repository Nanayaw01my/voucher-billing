# EUNISET LOVE - residents. Paste this whole block into the WinBox terminal.
#
# IMPORTANT - HOW THE LOGIN PAGE WORKS
#
# docs/hotspot-pages/login.html shows ONE field. Whatever is typed is sent as
# both the username and the password, and it is upper-cased first. So a
# resident account must have:
#
#   * name and password IDENTICAL
#   * both in UPPERCASE (or digits only)
#
# Right:  name="KWAME2026" password="KWAME2026"
# Wrong:  name="kwame"     password="kwame2026"   <- two different values
# Wrong:  name="kwame2026" password="kwame2026"   <- lowercase, page sends KWAME2026
#
/ip hotspot user profile remove [find name="RESIDENT"]
/ip hotspot user profile add name=RESIDENT shared-users=2 add-mac-cookie=yes rate-limit="4M/10M" status-autorefresh=1m
/ip hotspot profile set [find] mac-cookie-timeout=30d
/system script remove [find name="resident-first-use"]
/system script add name="resident-first-use" dont-require-permissions=no policy=read,write,test source=":global rfuUser; :global rfuMac; :local id [/ip hotspot user find name=\$rfuUser]; :if ([:len \$id] > 0) do={ :local c [/ip hotspot user get \$id mac-address]; :if ((\$c = \"\") or (\$c = \"00:00:00:00:00:00\")) do={ /ip hotspot user set \$id mac-address=\$rfuMac; :log info (\"resident \" . \$rfuUser . \" locked to \" . \$rfuMac) } }"
/ip hotspot user profile set [find name="RESIDENT"] on-login=":global rfuUser \$user; :global rfuMac \$\"mac-address\"; /system script run resident-first-use"
:put "RESIDENT ready. Add people with: /ip hotspot user add name=\"KWAME2026\" password=\"KWAME2026\" profile=RESIDENT"
