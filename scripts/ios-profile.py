#!/usr/bin/env python3
# App Store 用の署名プロファイル(provisioning profile)を App Store Connect API で用意する(GitHub Actions 用)。
#   1. Bundle ID(jp.techgym.offside)と、読み込んだ配布用の証明書(シリアル番号で探す)を API で見つける
#   2. 同じ名前のプロファイルがあり、有効でその証明書を含んでいればそれを使う。なければ作り直す
#   3. プロファイルを Xcode が読む場所に置き、名前と UUID を GITHUB_ENV に書く
# 必要な環境変数: ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH(.p8 のパス)/ BUNDLE_ID / CERT_SERIAL / PROFILE_NAME
# 依存: PyJWT と cryptography(ワークフローで pip install する)
import base64
import json
import os
import plistlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = 'https://api.appstoreconnect.apple.com/v1'


def token():
    import jwt  # PyJWT
    with open(os.environ['ASC_KEY_PATH'], 'rb') as f:
        key = f.read()
    now = int(time.time())
    payload = {'iss': os.environ['ASC_ISSUER_ID'], 'iat': now, 'exp': now + 15 * 60, 'aud': 'appstoreconnect-v1'}
    return jwt.encode(payload, key, algorithm='ES256', headers={'kid': os.environ['ASC_KEY_ID'], 'typ': 'JWT'})


def call(method, path, body=None, params=None):
    url = API + path + ('?' + urllib.parse.urlencode(params) if params else '')
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        sys.exit(f'App Store Connect API {method} {path} failed: {e.code} {e.read().decode(errors="replace")}')


def norm_serial(s):
    return s.strip().upper().lstrip('0')


def find_bundle_id(identifier):
    res = call('GET', '/bundleIds', params={'filter[identifier]': identifier, 'limit': 200})
    for b in res.get('data', []):
        if b['attributes']['identifier'] == identifier:
            return b['id']
    sys.exit(f'Bundle ID {identifier} が Apple Developer に登録されていません(docs/IOS_BUILD.md の 0 章)')


def find_certificate(serial):
    for kind in ('DISTRIBUTION', 'IOS_DISTRIBUTION'):
        res = call('GET', '/certificates', params={'filter[certificateType]': kind, 'limit': 200})
        for c in res.get('data', []):
            if norm_serial(c['attributes'].get('serialNumber', '')) == norm_serial(serial):
                return c['id']
    sys.exit('Secrets の証明書(.p12)が Apple Developer の配布用の証明書に見つかりません。取り消されていないか確認してください')


def get_profile(name, bundle_id, cert_id):
    res = call('GET', '/profiles', params={'filter[name]': name, 'include': 'certificates,bundleId', 'limit': 50})
    for p in res.get('data', []):
        if p['attributes']['name'] != name:
            continue
        rel = p.get('relationships', {})
        certs = [c['id'] for c in (rel.get('certificates', {}).get('data') or [])]
        bid = (rel.get('bundleId', {}).get('data') or {}).get('id')
        ok = p['attributes'].get('profileState') == 'ACTIVE' and cert_id in certs and bid == bundle_id
        if ok:
            return p['attributes']['profileContent']
        call('DELETE', f"/profiles/{p['id']}")  # 古い・証明書が違うものは消して作り直す
    body = {'data': {'type': 'profiles', 'attributes': {'name': name, 'profileType': 'IOS_APP_STORE'},
                     'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bundle_id}},
                                       'certificates': {'data': [{'type': 'certificates', 'id': cert_id}]}}}}
    return call('POST', '/profiles', body=body)['data']['attributes']['profileContent']


def install(content_b64):
    data = base64.b64decode(content_b64)
    # .mobileprovision は CMS で署名された plist。中の plist だけ取り出して UUID と名前を読む
    start, end = data.find(b'<?xml'), data.find(b'</plist>')
    info = plistlib.loads(data[start:end + len(b'</plist>')])
    uuid, name = info['UUID'], info['Name']
    home = os.path.expanduser('~')
    for d in ('Library/MobileDevice/Provisioning Profiles', 'Library/Developer/Xcode/UserData/Provisioning Profiles'):
        os.makedirs(os.path.join(home, d), exist_ok=True)
        with open(os.path.join(home, d, uuid + '.mobileprovision'), 'wb') as f:
            f.write(data)
    return uuid, name


def main():
    bundle = os.environ['BUNDLE_ID']
    bundle_id = find_bundle_id(bundle)
    cert_id = find_certificate(os.environ['CERT_SERIAL'])
    uuid, name = install(get_profile(os.environ['PROFILE_NAME'], bundle_id, cert_id))
    print(f'provisioning profile: {name} ({uuid})')
    if os.environ.get('GITHUB_ENV'):
        with open(os.environ['GITHUB_ENV'], 'a') as f:
            f.write(f'PROFILE_UUID={uuid}\nPROFILE_SPECIFIER={name}\n')


if __name__ == '__main__':
    main()
