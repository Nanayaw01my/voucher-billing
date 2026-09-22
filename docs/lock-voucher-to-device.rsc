# =============================================================================
#  EUNISET LOVE — lock each voucher to the first device that uses it
#
#  After this, a voucher used on phone A cannot be used on phone B. Ever, not
#  just at the same time.
#
#  HOW IT WORKS
#  On the first successful login, a script writes that device's MAC address
#  onto the voucher. RouterOS then refuses any other device for that voucher,
#  because a hotspot user with a mac-address set will only authenticate from
#  that address.
#
#  Vouchers already sold and used are not retrospectively locked -- they have
#  no MAC recorded yet. They lock on their next login.
#
#  READ THE WARNING AT THE BOTTOM BEFORE USING THIS.
#
#  Install:  upload this file, then  /import file-name=lock-voucher-to-device.rsc
# =============================================================================

# on-login belongs on the USER profile, not the server profile.
/ip hotspot user profile
set [find name~"VOUCHER"] on-login=":local u \$user; :local m \$\"mac-address\"; :local bound [/ip hotspot user get [find name=\$u] mac-address]; :if (\$bound = \"\") do={ /ip hotspot user set [find name=\$u] mac-address=\$m; :log info (\"voucher \" . \$u . \" locked to device \" . \$m); } "

# --- check it took --------------------------------------------------------
# /ip hotspot user profile print detail where on-login!=""
#
# --- watch it working ----------------------------------------------------
# After a customer logs in for the first time:
#   /log print where message~"locked to device"
#   /ip hotspot user print detail where name="THEIRCODE"
# The mac-address field will be filled in.
#
# --- free a voucher that a customer legitimately needs moved -------------
# Clears the lock so the next device to use it claims it instead:
#   /ip hotspot user set [find name="THEIRCODE"] !mac-address
#
# --- turn the whole thing off --------------------------------------------
#   /ip hotspot user profile set [find name~"VOUCHER"] on-login=""
# Existing locks stay until cleared individually, or all at once with:
#   /ip hotspot user set [find where mac-address!="00:00:00:00:00:00"] !mac-address


# =============================================================================
#  WARNING -- the cost of this
#
#  Phones randomise their WiFi MAC address. On iPhone this is "Private Wi-Fi
#  Address", and when its rotating option is on, the phone's address on your
#  network CHANGES periodically.
#
#  When that happens to a locked voucher, the customer is shut out of time
#  they paid for, and it looks like your system is broken rather than like
#  their privacy setting doing its job.
#
#  You then either clear the lock for them by hand (the command above), or ask
#  them to turn off the private address for your network -- which you cannot
#  make them do.
#
#  So this stops voucher sharing completely, and creates a support job you did
#  not have before. Whether that trade is worth it depends on how much sharing
#  is actually costing you. Consider running without it first and measuring.
# =============================================================================
