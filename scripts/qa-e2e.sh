#!/usr/bin/env bash
# StudioSpace end-to-end QA sweep (72 checks) against a running stack.
#
#   1. terminal A: npm run dev   (API, :5001)
#   2. terminal B: npm run dev   (client, :3000)
#   3. here:       bash scripts/qa-e2e.sh
#
# Covers: auth + JWT minting, studio CRUD + ownership, full booking lifecycle
# (pending → confirmed → completed, 409 overlap, 403 foreign actions), filters /
# sorting / pagination, wishlist, reviews + rating recompute, profile partial
# update, newsletter, upload guards, host dashboard data and every page route.
# Uses the two documented dev accounts; creates and deletes its own studios.
set -u
B=http://localhost:3000
J='Content-Type: application/json'
PASS=0
FAIL=0

chk() {
  local name="$1" expect="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expect" ]; then
    PASS=$((PASS + 1))
    printf "PASS  %-50s %s\n" "$name" "$actual"
  else
    FAIL=$((FAIL + 1))
    printf "FAIL  %-50s expected=%s got=%s body=%s\n" "$name" "$expect" "$actual" "$(head -c 150 "$body" 2>/dev/null)"
  fi
}

jqget() {
  python3 -c 'import json,sys
d=json.load(open(sys.argv[1]))
print(eval(sys.argv[2]))' "$1" "$2" 2>/dev/null
}

echo "=== AUTH ==="
curl -s -c host.jar -X POST $B/api/auth/sign-in/email -H "$J" -d '{"email":"host.test@studiospace.dev","password":"Studio123"}' -o /dev/null
curl -s -c guest.jar -X POST $B/api/auth/sign-in/email -H "$J" -d '{"email":"guest.test@studiospace.dev","password":"Studio123"}' -o /dev/null
chk "host JWT mint" 200 "$(curl -s -b host.jar -c host.jar -X POST $B/api/session -o /dev/null -w '%{http_code}')"
chk "guest JWT mint" 200 "$(curl -s -b guest.jar -c guest.jar -X POST $B/api/session -o /dev/null -w '%{http_code}')"
chk "GET /api/users/me (host)" 200 "$(curl -s -b host.jar -o me.json -w '%{http_code}' $B/api/users/me)"

echo "=== STUDIO CRUD ==="
mkstudio() {
  curl -s -b host.jar -X POST $B/api/studios -H "$J" -o "$1" -w '%{http_code}' -d '{"title":"QA Automation Studio Alpha","category":"Photo Studio","description":"Automated QA listing used to verify the booking, review and host approval lifecycle end to end.","hourlyRate":60,"securityDeposit":120,"maxCapacity":8,"address":"QA Road 1, Banani","city":"Dhaka","imageUrl":"/images/studios/photo-studio.jpg","gallery":[],"amenities":["Wi-Fi","Parking"],"equipment":["Softboxes"]}'
}
chk "POST /api/studios #1" 201 "$(mkstudio s1.json)"
S1=$(jqget s1.json "d['data']['studio']['id']")
chk "POST /api/studios #2" 201 "$(mkstudio s2.json)"
S2=$(jqget s2.json "d['data']['studio']['id']")
chk "GET /api/my-listings" 200 "$(curl -s -b host.jar -o ml.json -w '%{http_code}' $B/api/my-listings)"
chk "PUT studio (owner)" 200 "$(curl -s -b host.jar -X PUT $B/api/studios/$S2 -H "$J" -d '{"hourlyRate":75,"amenities":["Wi-Fi","Parking","Green Room"]}' -o up.json -w '%{http_code}')"
chk "PUT foreign studio -> 403" 403 "$(curl -s -b guest.jar -X PUT $B/api/studios/$S2 -H "$J" -d '{"hourlyRate":1}' -o up2.json -w '%{http_code}')"
chk "POST /api/studios unauth -> 401" 401 "$(curl -s -X POST $B/api/studios -H "$J" -d '{}' -o un.json -w '%{http_code}')"

echo "=== BOOKING LIFECYCLE ==="
DATE=$(date -u -d "+5 days" +%Y-%m-%d)
chk "guest books 10:00-12:00" 201 "$(curl -s -b guest.jar -X POST $B/api/bookings -H "$J" -o bk1.json -w '%{http_code}' -d "{\"studioId\":\"$S1\",\"bookingDate\":\"$DATE\",\"startTime\":\"10:00\",\"endTime\":\"12:00\"}")"
BK1=$(jqget bk1.json "d['data']['booking']['id']")
chk "server-computed total 2*60+120" 240 "$(jqget bk1.json "int(d['data']['booking']['totalPrice'])")"
chk "initial status Pending" Pending "$(jqget bk1.json "d['data']['booking']['status']")"
curl -s -b host.jar $B/api/host/bookings -o hb.json
chk "host sees the new request" True "$(jqget hb.json "any(b['id']=='$BK1' for b in d['data']['bookings'])")"
chk "host confirms" 200 "$(curl -s -b host.jar -X PATCH $B/api/host/bookings/$BK1/status -H "$J" -d '{"status":"Confirmed"}' -o c1.json -w '%{http_code}')"
chk "status Confirmed" Confirmed "$(jqget c1.json "d['data']['booking']['status']")"
curl -s -b guest.jar $B/api/my-bookings -o mb.json
chk "guest sees Confirmed" Confirmed "$(jqget mb.json "[b['status'] for b in d['data']['bookings'] if b['id']=='$BK1'][0]")"
chk "overlap 11:00-13:00 -> 409" 409 "$(curl -s -b guest.jar -X POST $B/api/bookings -H "$J" -d "{\"studioId\":\"$S1\",\"bookingDate\":\"$DATE\",\"startTime\":\"11:00\",\"endTime\":\"13:00\"}" -o ov.json -w '%{http_code}')"
chk "adjacent 12:00-14:00 -> 201" 201 "$(curl -s -b guest.jar -X POST $B/api/bookings -H "$J" -d "{\"studioId\":\"$S1\",\"bookingDate\":\"$DATE\",\"startTime\":\"12:00\",\"endTime\":\"14:00\"}" -o bk2.json -w '%{http_code}')"
BK2=$(jqget bk2.json "d['data']['booking']['id']")
chk "past date -> 400" 400 "$(curl -s -b guest.jar -X POST $B/api/bookings -H "$J" -d "{\"studioId\":\"$S1\",\"bookingDate\":\"2020-01-01\",\"startTime\":\"10:00\",\"endTime\":\"12:00\"}" -o past.json -w '%{http_code}')"
chk "guest self-confirm -> 403" 403 "$(curl -s -b guest.jar -X PATCH $B/api/host/bookings/$BK2/status -H "$J" -d '{"status":"Confirmed"}' -o f1.json -w '%{http_code}')"
chk "host marks Completed" 200 "$(curl -s -b host.jar -X PATCH $B/api/host/bookings/$BK1/status -H "$J" -d '{"status":"Completed"}' -o comp.json -w '%{http_code}')"
chk "guest cancels own Pending" 200 "$(curl -s -b guest.jar -X PATCH $B/api/bookings/$BK2/cancel -o can.json -w '%{http_code}')"
chk "cancel other's booking -> 403" 403 "$(curl -s -b host.jar -X PATCH $B/api/bookings/$BK2/cancel -o f2.json -w '%{http_code}')"

echo "=== FILTERS / SORT / PAGINATION ==="
curl -s "$B/api/studios?category=Photo%20Studio&limit=24" -o f1f.json
chk "category filter" True "$(jqget f1f.json "all(s['category']=='Photo Studio' for s in d['data']['studios'])")"
curl -s "$B/api/studios?minPrice=50&maxPrice=100&limit=24" -o f2f.json
chk "price range filter" True "$(jqget f2f.json "all(50<=s['hourlyRate']<=100 for s in d['data']['studios'])")"
curl -s "$B/api/studios?city=Dhaka&limit=24" -o f3f.json
chk "city filter" True "$(jqget f3f.json "all('dhaka' in s['location']['city'].lower() for s in d['data']['studios'])")"
curl -s "$B/api/studios?search=loft&limit=24" -o f4f.json
chk "search hits" True "$(jqget f4f.json "len(d['data']['studios'])>0")"
curl -s "$B/api/studios?sort=price-asc&limit=24" -o f5f.json
chk "sort price ascending" True "$(jqget f5f.json "[s['hourlyRate'] for s in d['data']['studios']]==sorted([s['hourlyRate'] for s in d['data']['studios']])")"
curl -s "$B/api/studios?sort=rating&limit=24" -o f6f.json
chk "sort rating descending" True "$(jqget f6f.json "[s['rating'] for s in d['data']['studios']]==sorted([s['rating'] for s in d['data']['studios']],reverse=True)")"
curl -s "$B/api/studios?limit=3&page=2" -o pf.json
chk "pagination page size" 3 "$(jqget pf.json "len(d['data']['studios'])")"
curl -s "$B/api/studios?capacity=8&limit=24" -o f7f.json
chk "capacity filter" True "$(jqget f7f.json "all(s['maxCapacity']>=8 for s in d['data']['studios'])")"
curl -s "$B/api/studios?amenities=Wi-Fi&limit=24" -o f8f.json
chk "amenities filter" True "$(jqget f8f.json "all(any(a.lower()=='wi-fi' for a in s['amenities']) for s in d['data']['studios'])")"
curl -s $B/api/studios/featured -o ft.json
chk "featured returns 6" 6 "$(jqget ft.json "len(d['data']['studios'])")"

echo "=== WISHLIST ==="
chk "add to wishlist" 201 "$(curl -s -b guest.jar -X POST $B/api/wishlist -H "$J" -d "{\"studioId\":\"$S1\"}" -o w1.json -w '%{http_code}')"
chk "duplicate add idempotent" 200 "$(curl -s -b guest.jar -X POST $B/api/wishlist -H "$J" -d "{\"studioId\":\"$S1\"}" -o w2.json -w '%{http_code}')"
curl -s -b guest.jar $B/api/wishlist -o w3.json
chk "wishlist list" 1 "$(jqget w3.json "len(d['data']['items'])")"
chk "remove from wishlist" 200 "$(curl -s -b guest.jar -X DELETE $B/api/wishlist/$S1 -o w4.json -w '%{http_code}')"

echo "=== REVIEWS ==="
chk "guest posts review" 201 "$(curl -s -b guest.jar -X POST $B/api/studios/$S1/reviews -H "$J" -d '{"rating":5,"comment":"QA review: light and equipment exactly as listed."}' -o r1.json -w '%{http_code}')"
curl -s $B/api/studios/$S1 -o r2.json
chk "rating recomputed" 5 "$(jqget r2.json "d['data']['studio']['rating']")"
chk "host self-review -> 400" 400 "$(curl -s -b host.jar -X POST $B/api/studios/$S1/reviews -H "$J" -d '{"rating":5,"comment":"self review must be blocked"}' -o r3.json -w '%{http_code}')"
curl -s $B/api/studios/$S1/reviews -o r4.json
chk "reviews list" 1 "$(jqget r4.json "len(d['data']['reviews'])")"
chk "guest deletes own review" 200 "$(curl -s -b guest.jar -X DELETE $B/api/studios/$S1/reviews -o r5.json -w '%{http_code}')"

echo "=== PROFILE / NEWSLETTER / UPLOAD ==="
chk "PATCH profile" 200 "$(curl -s -b guest.jar -X PATCH $B/api/users/me -H "$J" -d '{"name":"Rafi Guest"}' -o pr.json -w '%{http_code}')"
chk "profile name applied" "Rafi Guest" "$(jqget pr.json "d['data']['user']['name']")"
NEWS="qa-news-$(date +%s)@studiospace.dev"
chk "newsletter subscribe" 201 "$(curl -s -X POST $B/api/newsletter -H "$J" -d "{\"email\":\"$NEWS\"}" -o n1.json -w '%{http_code}')"
chk "newsletter duplicate" 200 "$(curl -s -X POST $B/api/newsletter -H "$J" -d "{\"email\":\"$NEWS\"}" -o n2.json -w '%{http_code}')"
chk "upload unauth -> 401" 401 "$(curl -s -X POST $B/api/upload -H "$J" -d '{"image":"data:image/png;base64,iVBORw0KGgo="}' -o u1.json -w '%{http_code}')"
chk "upload authed no key -> 501" 501 "$(curl -s -b host.jar -X POST $B/api/upload -H "$J" -d '{"image":"data:image/png;base64,iVBORw0KGgo="}' -o u2.json -w '%{http_code}')"

echo "=== HOST DASHBOARD DATA ==="
curl -s -b host.jar $B/api/my-listings -o ml2.json
chk "host owns both QA studios" 2 "$(jqget ml2.json "len([s for s in d['data']['studios'] if s['id'] in ['$S1','$S2']])")"
curl -s -b host.jar $B/api/host/bookings -o hb2.json
chk "host sees 2 QA bookings" 2 "$(jqget hb2.json "len([b for b in d['data']['bookings'] if b['studioId']=='$S1'])")"
chk "statuses Completed+Cancelled" "['Cancelled', 'Completed']" "$(jqget hb2.json "sorted([b['status'] for b in d['data']['bookings'] if b['studioId']=='$S1'])")"

echo "=== ROUTES ==="
for p in / /studios "/studios?category=Photo%20Studio" /studios/$S1 /host /dashboard /my-listings /my-bookings /wishlist /profile /add-studio /about /how-it-works /terms /privacy; do
  chk "GET $p" 200 "$(curl -s -b host.jar -o /dev/null -w '%{http_code}' "$B$p")"
done
chk "unknown studio id renders error page" 200 "$(curl -s -b host.jar -o /dev/null -w '%{http_code}' $B/studios/000000000000000000000000)"
chk "/host without session -> 307" 307 "$(curl -s -o /dev/null -w '%{http_code}' $B/host)"
chk "/api/session diagnostics" 200 "$(curl -s -b host.jar -o /dev/null -w '%{http_code}' $B/api/session)"

echo "=== CLEANUP ==="
chk "guest delete host studio -> 403" 403 "$(curl -s -b guest.jar -X DELETE $B/api/studios/$S2 -o d3.json -w '%{http_code}')"
chk "owner deletes studio #1" 200 "$(curl -s -b host.jar -X DELETE $B/api/studios/$S1 -o d1.json -w '%{http_code}')"
chk "owner deletes studio #2" 200 "$(curl -s -b host.jar -X DELETE $B/api/studios/$S2 -o d2.json -w '%{http_code}')"

echo
echo "RESULT: $PASS passed, $FAIL failed"
