#!/usr/bin/env python3
"""Answer EAS's interactive iOS credential prompts in CI (#31).

`eas build --non-interactive` refuses to create a Distribution Certificate or
provisioning profile. `eas credentials:configure-build` can, but only on a TTY.
This drives it under a pseudo-terminal: confirm prompts get "yes", list prompts
take the default. Apple auth comes from the App Store Connect API key env vars
(EXPO_ASC_*), so no Apple ID login happens. Idempotent: if credentials already
exist on EAS it just validates them.
"""
import sys
import pexpect

cmd = "npx --yes eas-cli@27 credentials:configure-build --platform ios --profile staging"
child = pexpect.spawn(cmd, encoding="utf-8", timeout=300, dimensions=(50, 200))
child.logfile_read = sys.stdout

confirm = r"\((?:Y/n|y/N)\)"
select = r"(?:Use arrow-keys|›\s.*\n)"  # inquirer/prompts list
while True:
    i = child.expect([confirm, r"Select .*", pexpect.EOF, pexpect.TIMEOUT])
    if i == 0:
        child.sendline("y")
    elif i == 1:
        child.send("\r")
    elif i == 2:
        break
    else:
        print("\n::error::timed out waiting for eas credentials", flush=True)
        child.close(force=True)
        sys.exit(1)

child.close()
sys.exit(child.exitstatus or 0)
