# Expression Complexity

grug once like to minimize lines of code much as possible. write code like this:

```
if(contact && !contact.isActive() && (contact.inGroup(FAMILY) || contact.inGroup(FRIENDS))) {
  // ...
}
```

over time grug learn this hard debug, learn prefer write like so:

```
if(contact) {
  var contactIsInactive = !contact.isActive();
  var contactIsFamilyOrFriends = contact.inGroup(FAMILY) || contact.inGroup(FRIENDS);
  if(contactIsInactive && contactIsFamilyOrFriends) {
      // ...
  }
}
```

grug hear screams from young grugs at horror of many line of code and pointless variable and grug
prepare defend self with club

club fight start with other developers attack and grug yell: "easier debug! see result of each
expression more clearly and good name! easier understand conditional expression! EASIER DEBUG!"

definitely easier debug and once club fight end calm down and young grug think a bit, they realize
grug right

grug still catch grug writing code like first example and often regret, so grug not judge young grug

---

(Original content from https://grugbrain.dev/)
