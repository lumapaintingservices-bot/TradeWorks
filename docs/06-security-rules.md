# 06 · Security rules (draft for the multi-tenant version)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function signedIn() { return request.auth != null; }
    function member(cid) { return signedIn() && exists(/databases/$(db)/documents/companies/$(cid)/members/$(request.auth.uid)); }
    function role(cid) { return get(/databases/$(db)/documents/companies/$(cid)/members/$(request.auth.uid)).data.role; }
    function admin(cid) { return member(cid) && role(cid) in ['owner','admin']; }

    match /users/{uid} { allow read, write: if signedIn() && request.auth.uid == uid; }

    match /companies/{cid} {
      allow create: if signedIn() && request.resource.data.ownerUid == request.auth.uid;
      allow read: if member(cid);
      allow update: if admin(cid);
      match /members/{uid} { allow read: if member(cid); allow write: if admin(cid); }
      // workers only see their own hours/tasks; owners/admins everything
      match /{col}/{id} {
        allow read: if admin(cid) || (member(cid) && col in ['tasks','hours','clock']);
        allow write: if admin(cid) || (member(cid) && col in ['hours','clock']);
      }
    }

    match /portal/{token} {
      allow get: if true;
      allow create, delete: if admin(request.resource.data.owner) || admin(resource.data.owner);
      allow update: if admin(resource.data.owner)
        || request.resource.data.diff(resource.data).affectedKeys().hasOnly(['client']);
      match /photos/{pid} { allow get: if true; allow write: if admin(get(/databases/$(db)/documents/portal/$(token)).data.owner); }
    }

    // invoice payment link (/pay/:token): get by token; owners/admins list theirs (where owner == cid);
    // a visitor may only add views and say "I paid" {method<=40, at<=40, note<=300} - never mark the invoice paid.
    // Full version with shape checks: firestore.rules (payClientOk). Tests: rules-tests/rules.security.test.mjs.
    match /paylink/{token} {
      allow get: if true;
      allow list, delete: if admin(resource.data.owner);
      allow create: if admin(request.resource.data.owner);
      allow update: if (admin(resource.data.owner) && request.resource.data.owner == resource.data.owner)
        || (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['client']) && payClientOk(request.resource.data.client));
    }

    match /leads/{lid} {
      allow create: if exists(/databases/$(db)/documents/companies/$(request.resource.data.owner))
        && request.resource.data.keys().hasOnly(['owner','name','phone','email','city','address','service','message','heard','lang','photos','details','at','page'])
        && request.resource.data.name is string && request.resource.data.name.size() > 0 && request.resource.data.name.size() <= 100
        && request.resource.data.phone is string && request.resource.data.phone.size() <= 30
        && request.resource.data.photos is list && request.resource.data.photos.size() <= 5;
      allow read, update, delete: if admin(resource.data.owner);
      match /photos/{pid} {
        allow create: if request.resource.data.keys().hasOnly(['data','at']) && !exists(/databases/$(db)/documents/leads/$(lid));
        allow read, delete: if admin(get(/databases/$(db)/documents/leads/$(lid)).data.owner);
      }
    }

    match /public/{cid} { allow get: if true; allow write: if admin(cid); }
    match /calfeed/{token} { allow get: if true; allow write: if admin(request.resource.data.owner); allow delete: if admin(resource.data.owner); }
    match /showcase/{cid}/items/{id} { allow read: if true; allow write: if admin(cid); }
  }
}
```
Storage: companies/{cid}/** read/write for members; public read only for showcase + portal photos.
Add App Check and rate limiting (Cloud Functions) before public launch; move lead photos to Storage via a
signed-upload Cloud Function to avoid anonymous writes.
