# Concurrency

grug, like all sane developer, fear concurrency

as much as possible, grug try to rely on simple concurrency models like stateless web request
handlers and simple remote job worker queues where jobs no interdepend and simple api

optimistic concurrency seem work well for web stuff

occasionally grug reach for thread local variable, usually when writing framework code

some language have good concurrent data structure, like java ConcurrentHashMap but still need
careful grug work to get right

grug has never used erlang, hear good things, but language look wierd to grug sorry

---

(Original content from https://grugbrain.dev/)
