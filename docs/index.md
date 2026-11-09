# docs/ — the dashboard

**Lead:** one page, two states: the bundle answers what is reachable **now**, and the LAN origin
that answers nothing is the door closed.

**Cross-repo rule:** a path written `infra/docs/...` lives in
[AbstractSignal/infra](https://github.com/AbstractSignal/infra) — the repo that owns the box, Caddy,
DNS, the secrets and the deploy. A bare `design.md`-style path is a file of this docs tree.

| File | Answers |
|---|---|
| `design.md` | what the page is, which cards answer through which door, and what the map draws |
| `measurements.md` | the per-card probes and what each returned |
| `operations.md` | how the bundle is built, pushed, and re-built; what a card change costs |

## Read first

`design.md` before touching a card: the card's door decides whether a change is a rebuild or a
router edit, and that is the difference between a `make` and a reboot-to-lease.

## Related

- the service that serves the bundle (the box, the nginx, the gate) → `infra/docs/services/homepage.md`
- the Gree doors a card dials → `infra/docs/devices/gree/index.md`
- the Home Assistant door → `infra/docs/devices/home-assistant.md`
- what a card answers through → `infra/docs/concepts.md`
- the build command, and the deploy that pushes the bundle → `infra/docs/control-machine/commands.md`
- the `.env` values this build is handed → `operations.md` (`The three things the bundle dials`)
