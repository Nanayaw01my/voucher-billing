import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMikrotikUserCommand, tokenize } from '../services/parser/mikrotikCommandParser';
import { parseCsv, parseJson } from '../services/parser/tabularParser';
import { parseRouterOsDuration, toRouterOsDuration, parseDataSize } from '../utils/format';

test('parses the exact command form used by the existing voucher stock', () => {
  const result = parseMikrotikUserCommand(
    '/ip hotspot user add name=D4BKB3UD password=D4BKB3UD profile="VOUCHER-24H-1CODE" limit-uptime=24h',
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.value, {
    code: 'D4BKB3UD',
    username: 'D4BKB3UD',
    password: 'D4BKB3UD',
    profileName: 'VOUCHER-24H-1CODE',
    limitUptimeSeconds: 86400,
  });
});

test('keeps quoted values intact', () => {
  assert.deepEqual(tokenize('a b="c d" e=f'), ['a', 'b=c d', 'e=f']);
});

test('rejects any command other than the whitelisted one', () => {
  for (const line of [
    '/system reboot name=x',
    '/ip firewall filter add chain=forward action=drop',
    '/ip hotspot user remove name=D4BKB3UD',
  ]) {
    const result = parseMikrotikUserCommand(line);
    assert.equal(result.ok, false, `expected "${line}" to be rejected`);
  }
});

test('rejects properties outside the whitelist', () => {
  const result = parseMikrotikUserCommand('/ip hotspot user add name=A1 profile=P on-login="/system reboot"');
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.reason : '', /not allowed/);
});

test('rejects unsafe characters in a name', () => {
  const result = parseMikrotikUserCommand('/ip hotspot user add name="A1; /system reboot" profile=P');
  assert.equal(result.ok, false);
});

test('defaults the password to the username when absent', () => {
  const result = parseMikrotikUserCommand('/ip hotspot user add name=ABC123 profile=P');
  assert.equal(result.ok && result.value.password, 'ABC123');
});

test('reads RouterOS durations in every form it emits', () => {
  assert.equal(parseRouterOsDuration('24h'), 86400);
  assert.equal(parseRouterOsDuration('1d2h30m'), 95400);
  assert.equal(parseRouterOsDuration('1w'), 604800);
  assert.equal(parseRouterOsDuration('00:45:12'), 2712);
  assert.equal(parseRouterOsDuration('3d 01:00:00'), 262800);
  assert.equal(parseRouterOsDuration('90'), 90);
  // Unknown must stay distinguishable from zero.
  assert.equal(parseRouterOsDuration('nonsense'), null);
  assert.equal(parseRouterOsDuration(undefined), null);
});

test('round-trips a duration back into RouterOS form', () => {
  assert.equal(toRouterOsDuration(86400), '1d');
  assert.equal(toRouterOsDuration(95400), '1d2h30m');
});

test('reads data sizes', () => {
  assert.equal(parseDataSize('1G'), 1024 ** 3);
  assert.equal(parseDataSize('500M'), 500 * 1024 ** 2);
  assert.equal(parseDataSize('2048'), 2048);
  assert.equal(parseDataSize('big'), null);
});

test('imports CSV with aliased headers', () => {
  const { rows } = parseCsv('code,password,profile,duration\nAB12,AB12,PKG,1h\nCD34,,PKG,2h');
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.ok && rows[0].value.code, 'AB12');
  // Blank password falls back to the username, as in the TXT path.
  assert.equal(rows[1]?.ok && rows[1].value.password, 'CD34');
});

test('imports JSON and applies the default profile', () => {
  const { rows } = parseJson('[{"code":"XY99"}]', { profile: 'VOUCHER-24H-1CODE' });
  assert.equal(rows[0]?.ok && rows[0].value.profileName, 'VOUCHER-24H-1CODE');
});
