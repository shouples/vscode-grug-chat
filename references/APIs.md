# APIs

grug love good apis. good apis not make grug think too much

unfortunately, many apis very bad, make grug think quite a bit. this happen many reasons, here two:

- API creators think in terms of implementation or domain of API, rather than in terms of use of API
- API creators think too abstract and big brained

usually grug not care too deeply about detail of api: want write file or sort list or whatever, just
want to call write() or sort() or whatever

but big brain api developers say:

"not so fast, grug! is that file open for write? did you define a Comparator for that sort?"

grug find self restraining hand reaching for club again

not care about that stuff right now, just want sort and write file mr big brain!

grug recognize that big brain api designer have point and that sometime these things matter, but
often do not. big brain api developers better if design for simple cases with simple api, make
complex cases possible with more complex api

grug call this "layering" apis: two or three different apis at different level complexity for
various grug needs

also, if object oriented, put api on thing instead of elsewhere. java worst at this!

grug want filter list in java

"Did you convert it to a stream?"

fine, grug convert to stream

"OK, now you can filter."

OK, but now need return list! have stream!

"Well, did you collect your stream into a list?"

what?

"Define a Collector<? super T, A, R> to collect your stream into a list"

grug now swear on ancestor grave he club every single person in room, but count two instead and
remain calm

put common thing like filter() on list and make return list, listen well big brain java api
developer!

nobody care about "stream" or even hear of "stream" before, is not networking api, all java grugs
use list mr big brain!

---

(Original content from https://grugbrain.dev/)
