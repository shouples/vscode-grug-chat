# Logging

grug huge fan of logging and encourage lots of it, especially in cloud deployed. some non-grugs say
logging expensive and not important. grug used think this way no more

funny story: grug learn idol rob pike working on logging at google and decide: "if rob pike working
on logging, what grug do there?!?" so not pursue. turn out logging very important to google so of
course best programmer work on it, grug!

don't be such grug brain, grug, much less shiney rock now!

oh well, grug end up at good company anyway and rob pike dress habit increasingly erratic, so all
work out in end, but point stand: logging very important!

grug tips on logging are:

- log all major logical branches within code (if/for)
- if "request" span multiple machine in cloud infrastructure, include request ID in all so logs can
  be grouped
- if possible make log level dynamically controlled, so grug can turn on/off when need debug issue
  (many!)
- if possible make log level per user, so can debug specific user issue

last two points are especially handy club when fighting bugs in production systems very often

unfortunately log libraries often very complex (java, why you do?) but worth investing time in
getting logging infrastructure "just right" pay off big later in grug experience

logging need taught more in schools, grug think

---

(Original content from https://grugbrain.dev/)
