window.__ModuleLoader__.load({
	id: "dsh-session-cost",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const reactDom = require("react-dom");
		/** Locale namespace owning this plugin's copy. */
		const NS = "sessionCost";
		/** The host projection this pill renders. */
		const PROJECTION = "sessionCost";
		/** Same-origin route serving the session-tree figure. */
		const TREE_PATH = "/session-cost/tree";
		/** Same-origin route serving the peak-window definition. */
		const PEAK_PATH = "/session-cost/peak";
		/** Same-origin route serving the account balance. */
		const BALANCE_PATH = "/session-cost/balance";
		/** How often the balance is re-read while the page stays open (ms). */
		const BALANCE_REFRESH_MS = 300000;
		/** How often the tree figure is re-read while the composer stays mounted (ms). */
		const TREE_REFRESH_MS = 30000;
		/**
		* English copy. The shipped languages are en/zh; Italian arrives with the
		* companion language pack, and a reader without one sees these strings.
		*/
		const en = {
			"pill.priced": "This session's cost {amount}",
			"pill.unpriced": "This session's cost is unavailable",
			"pill.atLeast": "This session's cost is at least {amount}",
			"pill.tree.priced": "This session's work, its subagents included, {amount}",
			"pill.tree.atLeast": "This session's work, its subagents included, is at least {amount}",
			"dialog.title": "Session cost",
			"dialog.inputMiss": "Input (cache miss)",
			"dialog.inputHit": "Input (cache hit)",
			"dialog.output": "Output",
			"dialog.cacheWrite": "Cache write",
			"peak.status.peak": "Peak hours",
			"peak.status.off": "Off-peak",
			"peak.title": "Peak hours",
			"peak.schedule": "Peak {ranges} · {days}",
			"peak.scheduleNone": "No peak hours published",
			"peak.change": "changes at {time}",
			"credit.title": "DeepSeek balance",
			"credit.aria": "DeepSeek balance {amount}",
			"credit.granted": "granted {amount}",
			"credit.toppedUp": "topped up {amount}",
			"credit.readAt": "read at {time}",
			"credit.low": "Balance too low for API calls",
			"credit.none": "The provider reported no balance",
			"credit.reason.missing-credential": "No DeepSeek API key is configured",
			"credit.reason.unauthorized": "The API key was refused",
			"credit.reason.timeout": "The provider did not answer in time",
			"credit.reason.network": "The provider is unreachable",
			"credit.reason.malformed": "The provider answered something unexpected",
			"credit.reason.http": "The provider answered {status}"
		};
		/** Italian copy, used whenever the Italian language pack is active. */
		const it = {
			"pill.priced": "Costo di questa sessione {amount}",
			"pill.unpriced": "Costo di questa sessione non disponibile",
			"pill.atLeast": "Costo di questa sessione almeno {amount}",
			"pill.tree.priced": "Costo di questo lavoro, sottoagenti inclusi, {amount}",
			"pill.tree.atLeast": "Costo di questo lavoro, sottoagenti inclusi, almeno {amount}",
			"dialog.title": "Costo della sessione",
			"dialog.inputMiss": "Input non in cache",
			"dialog.inputHit": "Input in cache",
			"dialog.output": "Output",
			"dialog.cacheWrite": "Scrittura cache",
			"peak.status.peak": "Ore di punta",
			"peak.status.off": "Fuori punta",
			"peak.title": "Ore di picco",
			"peak.schedule": "Picco {ranges} · {days}",
			"peak.scheduleNone": "Nessuna ora di picco pubblicata",
			"peak.change": "cambia alle {time}",
			"credit.title": "Saldo DeepSeek",
			"credit.aria": "Saldo DeepSeek {amount}",
			"credit.granted": "concessi {amount}",
			"credit.toppedUp": "ricaricati {amount}",
			"credit.readAt": "letto alle {time}",
			"credit.low": "Saldo insufficiente per le chiamate API",
			"credit.none": "Il provider non ha riportato alcun saldo",
			"credit.reason.missing-credential": "Nessuna chiave API DeepSeek configurata",
			"credit.reason.unauthorized": "La chiave API è stata rifiutata",
			"credit.reason.timeout": "Il provider non ha risposto in tempo",
			"credit.reason.network": "Il provider non è raggiungibile",
			"credit.reason.malformed": "Il provider ha risposto in modo inatteso",
			"credit.reason.http": "Il provider ha risposto {status}"
		};
		/** Stylesheet, keyed so a reload replaces it instead of stacking copies. */
		const CSS = ".dsc_root{max-width:var(--dsh-chat-content-width);box-sizing:border-box;width:100%;padding:0 calc(var(--dsh-composer-side-clearance) + 16px) 4px;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));justify-content:center;gap:12px;margin:0 auto;display:flex}.dsc_anchor{min-width:0;display:inline-flex}.dsc_pill{box-sizing:border-box;max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;border-radius:24px;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}.dsc_pill svg{flex:none;width:14px;height:14px}button.dsc_pill{cursor:pointer}button.dsc_pill:hover,button.dsc_pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.dsc_label{text-overflow:ellipsis;min-width:0;overflow:hidden}.dsc_panel{z-index:1100;box-sizing:border-box;background:var(--dsw-specific-menu);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;border-radius:12px;padding:16px;font-size:12px;line-height:18px;position:fixed}.dsc_title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}.dsc_titleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}.dsc_titleValue{font-variant-numeric:tabular-nums}.dsc_titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}.dsc_titleLabel svg{flex:none;width:14px;height:14px}.dsc_details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}.dsc_details dt,.dsc_details dd{min-width:0;margin:0}.dsc_details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}.dsp_root{box-sizing:border-box;margin:0 2px 8px;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l3,#0000);border-radius:12px;background:var(--dsw-alias-bg-module-platform,transparent);color:var(--dsw-alias-label-secondary);flex-direction:column;gap:3px;font-size:12px;line-height:16px;display:flex}.dsp_row{align-items:center;gap:6px;min-width:0;display:flex}.dsp_dot{background:#2ea043;border-radius:50%;flex:none;width:8px;height:8px}.dsp_dot[data-peak=true]{background:#d29922}.dsp_status{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden;font-weight:500}.dsp_schedule{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.dsp_inline{align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);white-space:nowrap;font-size:11px;line-height:14px;display:inline-flex}.dsp_inline .dsp_dot{width:7px;height:7px}.dsp_amount{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;flex:none;white-space:nowrap;font-size:13px}.dsp_amount[data-low=true]{color:var(--dsw-alias-label-warning,var(--dsw-alias-label-tertiary))}";
		const CSS_TAG = "dsh-session-cost/SessionCost.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-cost";
			tag.dataset.pluginCss = CSS_TAG;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		/** Currency formatter cache, one entry per fractional precision. */
		const currencyFormats = /* @__PURE__ */ new Map();
		/**
		* Format a USD amount for the active browser locale: cents at normal size,
		* finer precision only while the figure needs it.
		* @param value - amount in USD.
		* @returns the formatted amount.
		*/
		function formatUsd(value) {
			const digits = value !== 0 && Math.abs(value) < 0.01 ? 4 : Math.abs(value) < 1 ? 3 : 2;
			let format = currencyFormats.get(digits);
			if (format === void 0) {
				format = new Intl.NumberFormat(void 0, {
					style: "currency",
					currency: "USD",
					currencyDisplay: "narrowSymbol",
					minimumFractionDigits: digits,
					maximumFractionDigits: digits
				});
				currencyFormats.set(digits, format);
			}
			return format.format(value);
		}
		/**
		* Whether an instant is billed at the peak rate. The published windows are
		* UTC, so this reads the instant in UTC too: the answer must not depend on
		* the browser's zone, while every *label* the widget prints does.
		* @param peak - the peak definition from the host route.
		* @param time - epoch milliseconds.
		* @returns true inside a peak window on a listed weekday.
		*/
		function isPeakAt(peak, time) {
			const date = new Date(time);
			if (peak.weekdaysUtc.indexOf(date.getUTCDay()) === -1) return false;
			const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
			return peak.windowsUtc.some((window) => hour >= window.from && hour < window.to);
		}
		/** Local short weekday names, from the browser locale. */
		const dayFormat = new Intl.DateTimeFormat(void 0, { weekday: "short" });
		/** Local clock format for a schedule bound. */
		const clockFormat = new Intl.DateTimeFormat(void 0, {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false
		});
		/** Local weekday order starting at Monday, with the date of each. */
		const WEEK_START = [1, 2, 3, 4, 5, 6, 0];
		/**
		* Collapse day indices into runs: [1,2,3,4,5] becomes "lun–ven".
		* @param days - weekday indices in week order.
		* @param reference - an instant whose week supplies the dates.
		* @returns the label.
		*/
		function labelDays(days, reference) {
			const names = days.map((day) => {
				const date = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + ((day - reference.getDay() + 7) % 7));
				return dayFormat.format(date);
			});
			if (names.length <= 2) return names.join(", ");
			return names[0] + "–" + names[names.length - 1];
		}
		/**
		* The schedule as the reader's own clock shows it: which local hours are
		* peak, grouped by the weekdays that share them. Walking local hours and
		* asking the UTC predicate keeps this correct in every zone, including the
		* ones where the published windows land on a different local day.
		* @param peak - the peak definition.
		* @param now - the instant the week is read from.
		* @returns groups of weekday labels and their local ranges.
		*/
		function localSchedule(peak, instant) {
			const base = new Date(instant);
			base.setHours(0, 0, 0, 0);
			const groups = [];
			for (const day of WEEK_START) {
				const ranges = [];
				let open = null;
				for (let hour = 0; hour < 24; hour++) {
					const at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + ((day - base.getDay() + 7) % 7), hour).getTime();
					const peakHour = isPeakAt(peak, at);
					if (peakHour && open === null) open = hour;
					else if (!peakHour && open !== null) {
						ranges.push([open, hour]);
						open = null;
					}
				}
				if (open !== null) ranges.push([open, 24]);
				const key = JSON.stringify(ranges);
				const match = groups.find((group) => group.key === key);
				if (match === undefined) groups.push({ key, ranges, days: [day] });
				else match.days.push(day);
			}
			return groups.map((group) => ({
				days: group.days,
				label: labelDays(group.days, base),
				ranges: group.ranges,
				text: group.ranges.length === 0 ? "" : group.ranges.map(([from, to]) => {
					const at = (hour) => clockFormat.format(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour));
					return at(from) + "–" + at(to);
				}).join(", ")
			}));
		}
		/**
		* The instant the peak/off-peak state next flips, scanned minute by minute
		* so the widget can say *when*, not merely that it will.
		* @param peak - the peak definition.
		* @param now - the current instant.
		* @returns the flip instant, or undefined beyond a week.
		*/
		function nextChangeAt(peak, now) {
			const here = isPeakAt(peak, now);
			for (let minute = 1; minute <= 7 * 24 * 60; minute++) {
				const at = now + minute * 60000;
				if (isPeakAt(peak, at) !== here) return at;
			}
			return void 0;
		}
		/**
		* The amount a reader should see, and whether it is a floor rather than an
		* exact figure because some billed requests have no published price.
		* @param cost - the sessionCost projection value.
		* @returns the formatted amount plus the at-least flag.
		*/
		function displayAmount(cost) {
			if (cost.pricedRequests === 0) return { text: "—", atLeast: false, priced: false };
			return { text: formatUsd(cost.total), atLeast: cost.unpricedRequests > 0, priced: true };
		}
		/**
		* One addend of the total, as money: the em dash stands in wherever no
		* published rate priced the session at all.
		* @param cost - the sessionCost projection value.
		* @param value - the bucket's money.
		* @returns the formatted amount.
		*/
		function displayMoney(cost, value) {
			return cost.pricedRequests === 0 ? "—" : formatUsd(value);
		}
		/** A coin glyph in the shipped icon idiom: 16-unit viewBox, currentColor stroke. */
		function CostIcon() {
			return react.createElement("svg", {
				viewBox: "0 0 16 16",
				"aria-hidden": true,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.2,
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}, react.createElement("circle", {
				cx: 8,
				cy: 8,
				r: 6.1
			}), react.createElement("path", {
				d: "M8 4.7v6.6"
			}), react.createElement("path", {
				d: "M10.2 6.4c0-.9-.9-1.4-2.2-1.4s-2.2.5-2.2 1.4S6.8 7.7 8 7.9s2.2.6 2.2 1.5-.9 1.4-2.2 1.4-2.2-.5-2.2-1.4"
			}));
		}
		/**
		* Measure the pill and place the panel above it, clamped to the viewport.
		* The dock is the composer's lowest band, so the panel always opens upward
		* and needs no second measuring pass.
		* @param open - whether the panel is showing.
		* @param anchor - the pill element.
		* @returns the anchored style, or undefined while closed.
		*/
		function useAnchoredPanel(open, anchor) {
			const [style, setStyle] = react.useState(void 0);
			react.useEffect(() => {
				if (!open) {
					setStyle(void 0);
					return;
				}
				const place = () => {
					const node = anchor.current;
					if (node === null) return;
					const rect = node.getBoundingClientRect();
					const width = Math.min(340, window.innerWidth - 24);
					const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
					setStyle({
						left: left + "px",
						bottom: Math.max(8, window.innerHeight - rect.top + 6) + "px",
						width: width + "px"
					});
				};
				place();
				window.addEventListener("resize", place);
				window.addEventListener("scroll", place, true);
				return () => {
					window.removeEventListener("resize", place);
					window.removeEventListener("scroll", place, true);
				};
			}, [open, anchor]);
			return style;
		}
		/**
		* Dismiss the panel on an outside press or Escape.
		* @param open - whether the panel is showing.
		* @param close - closes the panel.
		* @param anchor - the pill element, whose own click must not double-close.
		* @param panel - the panel element.
		*/
		function useDismiss(open, close, anchor, panel) {
			react.useEffect(() => {
				if (!open) return;
				const onPointerDown = (event) => {
					const target = event.target;
					if (anchor.current?.contains(target) === true) return;
					if (panel.current?.contains(target) === true) return;
					close();
				};
				const onKeyDown = (event) => {
					if (event.key === "Escape") close();
				};
				document.addEventListener("pointerdown", onPointerDown, true);
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("pointerdown", onPointerDown, true);
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [open, close, anchor, panel]);
		}
		/** One label/value row of the details grid. */
		function Row({ label, value }) {
			return react.createElement(react.Fragment, null, react.createElement("dt", null, label), react.createElement("dd", null, value));
		}
		/**
		* The cost panel: the session total over the addends it is made of — the
		* three billed buckets, and a cache-write line only where a table charges
		* one (DeepSeek publishes none, so the three lines are the total).
		* @param props - projection value, translator, and panel state.
		* @returns the panel element tree.
		*/
		function CostPanel({ cost, t, style, panelRef }) {
			const { text } = displayAmount(cost);
			const rows = [react.createElement(Row, {
				key: "miss",
				label: t("dialog.inputMiss"),
				value: displayMoney(cost, cost.cost.miss)
			}), react.createElement(Row, {
				key: "hit",
				label: t("dialog.inputHit"),
				value: displayMoney(cost, cost.cost.hit)
			}), react.createElement(Row, {
				key: "out",
				label: t("dialog.output"),
				value: displayMoney(cost, cost.cost.out)
			})];
			if (cost.cost.write > 0) rows.push(react.createElement(Row, {
				key: "write",
				label: t("dialog.cacheWrite"),
				value: displayMoney(cost, cost.cost.write)
			}));
			return react.createElement("div", {
				ref: panelRef,
				className: "dsc_panel",
				role: "dialog",
				"aria-label": t("dialog.title"),
				style
			}, react.createElement("div", {
				className: "dsc_title"
			}, react.createElement("span", {
				className: "dsc_titleLabel"
			}, react.createElement(CostIcon, null), t("dialog.title")), react.createElement("span", {
				className: "dsc_titleValue"
			}, text)), react.createElement("div", {
				className: "dsc_titleRule",
				"aria-hidden": true
			}), react.createElement("dl", {
				className: "dsc_details"
			}, rows));
		}
		/**
		* The shipped statistics row, found through the hook that component
		* publishes on itself (`data-composer-stats`). Portalling the pill into that
		* row is what puts the cost *beside* the time and usage pills instead of on
		* a line of its own, and it stays additive: the shipped component keeps
		* rendering its own two pills, and nothing shipped is replaced.
		*
		* The element is resolved during render — which happens on every projection
		* update — so a row remounted by a session switch is picked up on the next
		* pass, and a one-shot observer covers only the window where the row does
		* not exist yet.
		* @returns the current row element, or null while it is absent.
		*/
		function useStatsRow() {
			const cached = react.useRef(null);
			const [row, setRow] = react.useState(null);
			const found = cached.current !== null && cached.current.isConnected ? cached.current : document.querySelector("[data-composer-stats]");
			react.useEffect(() => {
				if (found !== null || typeof MutationObserver === "undefined") return;
				const observer = new MutationObserver(() => {
					const node = document.querySelector("[data-composer-stats]");
					if (node === null) return;
					cached.current = node;
					observer.disconnect();
					setRow(node);
				});
				observer.observe(document.body, {
					childList: true,
					subtree: true
				});
				return () => observer.disconnect();
			}, [found]);
			if (found !== row) cached.current = found;
			return found ?? row;
		}
		/**
		* The session-**tree** figure: this session plus every session below it,
		* read from the host route. It is what the pill shows, because the question
		* the pill answers is what the work cost — and delegated work runs in
		* sessions of its own.
		*
		* The route is read on mount, whenever the session bills another request,
		* whenever the panel opens, and on a slow backstop interval; the host caches
		* its own answer for a second, so those reads collapse. Every failure is
		* silent and leaves the caller with the per-session projection instead: a
		* server that predates this route, a refused fetch, or a malformed body all
		* degrade to the session's own figure rather than to nothing.
		* @param sessionId - the session being viewed.
		* @param trigger - a value whose change asks for a fresh read.
		* @returns the tree value, or undefined until one arrives.
		*/
		function useTreeCost(sessionId, trigger) {
			const [value, setValue] = react.useState(void 0);
			react.useEffect(() => {
				if (typeof fetch !== "function" || typeof sessionId !== "string" || sessionId === "") return;
				let cancelled = false;
				const load = () => {
					fetch(TREE_PATH + "?session=" + encodeURIComponent(sessionId), {
						headers: { accept: "application/json" }
					}).then((response) => response.ok ? response.json() : void 0).then((json) => {
						if (cancelled) return;
						if (json === void 0 || json === null || typeof json.total !== "number" || typeof json.cost !== "object" || json.cost === null) return;
						setValue(json);
					}).catch(() => {});
				};
				load();
				const timer = setInterval(load, TREE_REFRESH_MS);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, [sessionId, trigger]);
			return value;
		}
		/**
		* The composer-dock entry: one pill carrying the session's cost, opening the
		* breakdown panel. It rides inside the shipped statistics row when that row
		* exists, and falls back to a matching row of its own when it does not.
		* @param props - slot props: the projection reader, the translator, and the session.
		* @returns the pill element tree.
		*/
		function SessionCostPill({ useProjection, t, sessionId }) {
			const cost = useProjection(PROJECTION);
			const [open, setOpen] = react.useState(false);
			const anchor = react.useRef(null);
			const panel = react.useRef(null);
			const style = useAnchoredPanel(open, anchor);
			const close = react.useCallback(() => {
				setOpen(false);
			}, []);
			useDismiss(open, close, anchor, panel);
			const statsRow = useStatsRow();
			const tree = useTreeCost(sessionId, (cost === void 0 ? 0 : cost.requests) + ":" + (open ? 1 : 0));
			// The tree figure wins whenever it saw any billed request: it covers this
			// session too, and only it covers the subagents.
			const shown = tree !== void 0 && tree.requests > 0 ? tree : cost;
			if (shown === void 0 || shown.requests === 0) return null;
			const { text, atLeast, priced } = displayAmount(shown);
			const deeper = (shown.sessions ?? 1) > 1;
			const label = priced ? atLeast ? t(deeper ? "pill.tree.atLeast" : "pill.atLeast", { amount: text }) : t(deeper ? "pill.tree.priced" : "pill.priced", { amount: text }) : t("pill.unpriced");
			const pill = react.createElement("span", {
				className: "dsc_anchor",
				ref: anchor
			}, react.createElement("button", {
				type: "button",
				className: "dsc_pill",
				"aria-haspopup": "dialog",
				"aria-expanded": open,
				"aria-label": label,
				onClick: () => {
					setOpen(!open);
				}
			}, react.createElement(CostIcon, null), react.createElement("span", {
				className: "dsc_label"
			}, atLeast ? "≥ " : "", text)));
			return react.createElement(react.Fragment, null, statsRow === null ? react.createElement("div", {
				className: "dsc_root"
			}, pill) : reactDom.createPortal(pill, statsRow), open && style !== void 0 && reactDom.createPortal(react.createElement(CostPanel, {
				cost: shown,
				t,
				style,
				panelRef: panel
			}), document.body));
		}
		/**
		* The peak definition, fetched once for the whole page: it is a constant of
		* the price table, not of a session. A failure leaves it undefined, and the
		* widget renders nothing rather than asserting a schedule it cannot know.
		* @returns the shared fetch, resolved with the definition or undefined.
		*/
		let peakRequest;
		function fetchPeak() {
			if (peakRequest === void 0) {
				peakRequest = typeof fetch === "function" ? fetch(PEAK_PATH, {
					headers: { accept: "application/json" }
				}).then((response) => response.ok ? response.json() : void 0).then((json) => {
					if (json === void 0 || json === null || json.available !== true || !Array.isArray(json.windowsUtc) || !Array.isArray(json.weekdaysUtc)) return void 0;
					return json;
				}).catch(() => void 0).then((json) => {
					// A read that answered nothing is not a cached fact: let the next
					// mount try again rather than hiding the widget for this page's life.
					if (json === void 0) peakRequest = void 0;
					return json;
				}) : Promise.resolve(void 0);
			}
			return peakRequest;
		}
		/**
		* Read the shared peak definition.
		* @returns the definition, or undefined until it arrives (or if it cannot).
		*/
		function usePeak() {
			const [value, setValue] = react.useState(void 0);
			react.useEffect(() => {
				let live = true;
				fetchPeak().then((json) => {
					if (live && json !== void 0) setValue(json);
				});
				return () => {
					live = false;
				};
			}, []);
			return value;
		}
		/**
		* Re-render on the minute: the widget's whole point is that "am I in peak
		* hours" is answered for the minute the reader is in.
		* @returns the current instant, refreshed once a minute.
		*/
		function useMinuteTick() {
			const [now, setNow] = react.useState(() => Date.now());
			react.useEffect(() => {
				const timer = setInterval(() => setNow(Date.now()), 60000);
				return () => clearInterval(timer);
			}, []);
			return now;
		}
		/**
		* The sidebar's New-session button, found by the *source-local* half of its
		* CSS-module class (`*_newSession`): the hash prefix changes per build, the
		* local name is the component's own, and the element is verified as a button.
		* @returns the element, or null.
		*/
		function findNewSessionButton() {
			for (const button of document.querySelectorAll("button[class]")) {
				for (const token of button.classList) if (token.endsWith("_newSession")) return button;
			}
			return null;
		}
		/**
		* The sidebar's brand row (`*_logoRow`), the secondary anchor for the same
		* position when the New-session button is not the one that follows it.
		* @returns the element, or null.
		*/
		function findLogoRow() {
			for (const node of document.querySelectorAll("div[class]")) {
				for (const token of node.classList) if (token.endsWith("_logoRow")) return node;
			}
			return null;
		}
		/** Insert the holder between the brand row and the New-session button. */
		function placeBeforeNewSession(holder) {
			const button = findNewSessionButton();
			if (button !== null && button.parentElement !== null) {
				button.parentElement.insertBefore(holder, button);
				return holder.isConnected;
			}
			const row = findLogoRow();
			if (row !== null && row.parentElement !== null) {
				row.parentElement.insertBefore(holder, row.nextSibling);
				return holder.isConnected;
			}
			return false;
		}
		/**
		* The Settings row (`*_triggerRow`): the flex row the settings seat renders
		* around its own trigger button and the connection indicator. That row is
		* where "beside Settings" exists as a real position.
		* @returns the element, or null.
		*/
		function findSettingsTriggerRow() {
			for (const node of document.querySelectorAll("div[class]")) {
				for (const token of node.classList) if (token.endsWith("_triggerRow")) return node;
			}
			return null;
		}
		/**
		* Insert the holder inside the Settings row, after its trigger button and
		* before whatever the row already renders to the right of it. The button is
		* `flex: 1`, so a sibling lands at the row's right edge without anything
		* being reparented.
		*/
		function placeBesideSettings(holder) {
			const row = findSettingsTriggerRow();
			if (row === null) return false;
			const button = Array.prototype.find.call(row.children, (child) => child.tagName === "BUTTON") ?? null;
			if (button !== null && button.parentElement === row) {
				row.insertBefore(holder, button.nextSibling);
				return holder.isConnected;
			}
			row.appendChild(holder);
			return holder.isConnected;
		}
		/**
		* A node placed inside a shipped element — the positions the composition
		* publishes no slot for. The anchor is the *source-local* half of a
		* CSS-module class name (the hash prefix changes per build, the local name
		* belongs to the component), the result is verified by tag, and the node is
		* re-inserted whenever React drops it. When no anchor is found the caller
		* keeps rendering in its supported seat instead.
		* @param active - whether the widget wants that position at all.
		* @param strategy - where to insert the holder, and whether it landed.
		* @returns the container to portal into, or undefined to render in place.
		*/
		function usePlacedNode(active, strategy) {
			const [node, setNode] = react.useState(void 0);
			const placement = react.useRef(strategy);
			placement.current = strategy;
			react.useEffect(() => {
				if (!active) return;
				const holder = document.createElement("div");
				holder.dataset.sessionCostPlaced = "";
				const place = () => {
					if (holder.isConnected) return true;
					return placement.current(holder);
				};
				let observer;
				let retries = 0;
				let timer;
				const watch = () => {
					if (observer !== void 0 || typeof MutationObserver === "undefined") return;
					const parent = holder.parentElement;
					if (parent === null) return;
					observer = new MutationObserver(() => {
						if (!holder.isConnected) place();
					});
					observer.observe(parent, { childList: true });
				};
				if (place()) {
					setNode(holder);
					watch();
				} else {
					timer = setInterval(() => {
						if (place()) {
							clearInterval(timer);
							setNode(holder);
							watch();
						} else if (++retries >= 5) clearInterval(timer);
					}, 1000);
				}
				return () => {
					clearInterval(timer);
					observer?.disconnect();
					setNode(void 0);
					holder.remove();
				};
			}, [active]);
			return node;
		}
		/**
		* The peak-hour widget: whether the current minute is billed at the peak
		* rate, and the schedule as the reader's own clock shows it. It rides the
		* requested position when it can be placed, and the supported sidebar-footer
		* seat otherwise; the collapsed rail renders nothing either way.
		* @param props - slot props: the translator and the owner's column state.
		* @returns the widget element tree, or null while it cannot be shown.
		*/
		function PeakHours({ t, wide }) {
			const peak = usePeak();
			const now = useMinuteTick();
			const node = usePlacedNode(wide === true && peak !== void 0, placeBeforeNewSession);
			if (wide !== true || peak === void 0) return null;
			const inPeak = isPeakAt(peak, now);
			const status = t(inPeak ? "peak.status.peak" : "peak.status.off");
			const groups = localSchedule(peak, now).filter((group) => group.ranges.length > 0);
			const schedule = groups.length === 0 ? t("peak.scheduleNone") : groups.map((group) => t("peak.schedule", {
				ranges: group.text,
				days: group.label
			})).join(" · ");
			const change = nextChangeAt(peak, now);
			const title = t("peak.title") + " · " + status + (change === void 0 ? "" : " · " + t("peak.change", { time: clockFormat.format(new Date(change)) }));
			const dot = react.createElement("span", {
				className: "dsp_dot",
				"data-peak": inPeak ? "true" : "false"
			});
			if (node === void 0) return react.createElement("div", {
				className: "dsp_inline",
				title,
				"aria-label": title
			}, dot, react.createElement("span", null, status));
			return reactDom.createPortal(react.createElement("div", {
				className: "dsp_root",
				title,
				"aria-label": title
			}, react.createElement("span", {
				className: "dsp_row"
			}, dot, react.createElement("span", {
				className: "dsp_status"
			}, status)), react.createElement("span", {
				className: "dsp_schedule"
			}, schedule)), node);
		}
		/**
		* Read the account balance: once on mount, then on a slow interval while
		* the page stays open. The host caches its own answer for a minute, so
		* several tabs collapse into one provider call.
		* @returns the balance view, or undefined until the first answer.
		*/
		function useBalance() {
			const [value, setValue] = react.useState(void 0);
			react.useEffect(() => {
				if (typeof fetch !== "function") return;
				let live = true;
				const load = () => {
					fetch(BALANCE_PATH, {
						headers: { accept: "application/json" }
					}).then((response) => response.ok ? response.json() : void 0).then((json) => {
						if (!live || json === void 0 || json === null || typeof json.available !== "boolean") return;
						setValue(json);
					}).catch(() => {});
				};
				load();
				const timer = setInterval(load, BALANCE_REFRESH_MS);
				return () => {
					live = false;
					clearInterval(timer);
				};
			}, []);
			return value;
		}
		/** Money format cache, keyed by currency and precision. */
		const moneyFormats = /* @__PURE__ */ new Map();
		/**
		* Format one provider amount without ever rounding it: the provider sends
		* exact decimal strings, so the shown precision is its own (at least the two
		* a currency has, more if it sent more). A value this cannot read is shown
		* exactly as sent.
		* @param raw - the amount string.
		* @param currency - the ISO code.
		* @returns the formatted amount.
		*/
		function formatMoney(raw, currency) {
			const value = Number(raw);
			if (raw === "" || !Number.isFinite(value)) return raw;
			const dot = raw.indexOf(".");
			const digits = Math.max(2, dot === -1 ? 0 : Math.min(6, raw.length - dot - 1));
			const key = currency + ":" + digits;
			let format = moneyFormats.get(key);
			if (format === void 0) {
				try {
					format = new Intl.NumberFormat(void 0, {
						style: "currency",
						currency,
						currencyDisplay: "narrowSymbol",
						minimumFractionDigits: digits,
						maximumFractionDigits: digits
					});
				} catch {
					// An unknown currency code formats as a plain number.
					format = new Intl.NumberFormat(void 0, {
						minimumFractionDigits: digits,
						maximumFractionDigits: digits
					});
				}
				moneyFormats.set(key, format);
			}
			return format.format(value);
		}
		/**
		* The host's reason tokens, named explicitly so an unrecognized one is shown
		* as it arrived instead of asking the dictionary for a key it cannot have.
		*/
		const CREDIT_REASONS = {
			"missing-credential": "credit.reason.missing-credential",
			"unauthorized": "credit.reason.unauthorized",
			"timeout": "credit.reason.timeout",
			"network": "credit.reason.network",
			"malformed": "credit.reason.malformed"
		};
		/**
		* Why the balance could not be read, in words.
		* @param reason - the host's reason token.
		* @param t - the translator.
		* @returns the sentence.
		*/
		function creditReason(reason, t) {
			if (typeof reason !== "string" || reason === "") return t("credit.none");
			if (reason.startsWith("http-")) return t("credit.reason.http", { status: reason.slice(5) });
			const key = CREDIT_REASONS[reason];
			return key === void 0 ? reason : t(key);
		}
		/**
		* The account balance beside Settings: the provider's own figure, with the
		* split and the read time in the tooltip. It renders nothing until the first
		* answer, and an em dash when there is no figure to show — never a zero.
		* @param props - slot props: the translator.
		* @returns the balance element tree, or null while no answer has arrived.
		*/
		function AccountCredit({ t, wide }) {
			const data = useBalance();
			// The rail is 56px: a money figure does not fit, and a clipped or rounded
			// one would misstate the balance. It returns in the wide column.
			const wanted = wide === true && data !== void 0;
			const node = usePlacedNode(wanted, placeBesideSettings);
			if (!wanted) return null;
			const balances = data.available === true && Array.isArray(data.balances) ? data.balances : [];
			const parts = [t("credit.title")];
			if (data.available !== true) parts.push(creditReason(data.reason, t));
			else if (balances.length === 0) parts.push(t("credit.none"));
			else {
				for (const entry of balances) {
					parts.push(formatMoney(entry.total, entry.currency));
					if (entry.granted !== "") parts.push(t("credit.granted", { amount: formatMoney(entry.granted, entry.currency) }));
					if (entry.toppedUp !== "") parts.push(t("credit.toppedUp", { amount: formatMoney(entry.toppedUp, entry.currency) }));
				}
			}
			if (data.isAvailable === false) parts.push(t("credit.low"));
			if (typeof data.fetchedAt === "number") parts.push(t("credit.readAt", { time: clockFormat.format(new Date(data.fetchedAt)) }));
			const title = parts.join(" · ");
			const shown = balances.length === 0 ? "—" : balances.map((entry) => formatMoney(entry.total, entry.currency)).join(" · ");
			const readout = react.createElement("span", {
				className: "dsp_inline",
				title,
				"aria-label": balances.length === 0 ? title : t("credit.aria", { amount: shown })
			}, react.createElement("span", {
				className: "dsp_amount",
				"data-low": data.available === true && data.isAvailable === false ? "true" : "false"
			}, shown));
			// Beside Settings when that row can be anchored; otherwise the supported
			// footer seat above it, so the figure is never lost.
			return node === void 0 ? readout : reactDom.createPortal(readout, node);
		}
		/** Services this plugin needs: the slot registry and the locale seat. */
		const inject = ["slots", "locale"];
		/**
		* Mount the cost pill and register its copy. Both the dictionaries and the
		* slot entry are effects on this plugin's fiber, so a reload or an unload
		* removes exactly what it contributed.
		* @param ctx - client cordis context.
		*/
		function apply(ctx) {
			ctx.effect(() => {
				try {
					return ctx.locale.register(NS, "en", en);
				} catch {
					return () => {};
				}
			}, "session-cost: en dictionary");
			ctx.effect(() => {
				try {
					return ctx.locale.register(NS, "it", it);
				} catch {
					return () => {};
				}
			}, "session-cost: it dictionary");
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "session-cost",
				order: 1,
				locale: NS
			}, SessionCostPill));
			// The sidebar seat is the *fallback* carrier of the peak widget: it is
			// what renders the component at all, and the component moves itself into
			// the requested position when that position can be anchored.
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "peak-hours",
				order: 10,
				locale: NS
			}, PeakHours));
			// The account balance: the seat's own purpose is an action beside
			// Settings at the sidebar foot, which is where money belongs.
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "account-credit",
				order: 20,
				locale: NS
			}, AccountCredit));
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
