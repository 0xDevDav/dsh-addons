window.__ModuleLoader__.load({
	id: "dsh-brand-davcode",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const { jsx } = require("react/jsx-runtime");

		const NAME = "DavCode";
		const ROLE = "AGENT";
		/** What the shipped layout writes into the window title, and its replacement. */
		const SHIPPED_PRODUCT = "DeepSeek Harness";
		const PRODUCT = NAME + " " + ROLE;
		/**
		 * Seat priority. These seats are `single` and the shipped fish holds them at 0; the
		 * registry states the rule itself — "already has a registration at priority 0 …
		 * register at a different priority to shadow it (lowest renders)" — so the seat is
		 * taken by going below the occupant. A higher number loses, and no number throws.
		 */
		const PRIORITY = -1;

		/**
		 * The artwork of the four supplied SVGs, transcribed — not re-drawn, not re-centred,
		 * not re-derived. Every number below is the author's: the 495×120 lockup canvas, the
		 * 120×120 mark canvas with its group shift, the 50px name at (150, 78) with its two
		 * weights and −0.5 tracking, the 106×38 badge at translate(372, 41) with its 20px
		 * label at (53, 19), and the four strokes of the icon.
		 *
		 * The only two things that differ from a literal transcription are structural, and
		 * neither moves a coordinate:
		 *
		 * 1. Each colour that the author drew twice — once for the dark ground, once for the
		 *    light one — is stored as that pair and resolved from the active colour scheme,
		 *    so the drawing follows the theme instead of the scheme it was exported for.
		 * 2. The label is centred by `text-anchor` and `dominant-baseline`, exactly as drawn,
		 *    rather than by any arithmetic over its width.
		 */
		const ART = {
			font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
			/** the lockup canvas, whole: the margins around the art are part of the drawing */
			canvas: { viewBox: "0 0 495 120", width: 495, height: 120 },
			/** the mark's own square canvas, with the drawn shift of its content */
			markBox: { viewBox: "0 0 120 120", edge: 120, transform: "translate(-21, -5)" },
			/** the dark pair is the first SVG, the light pair the second */
			accent: { dark: "#00FF9D", light: "#009E60" },
			iconInk: { dark: "#F5F5F5", light: "#1A1A1A" },
			nameInk: { dark: "#FFFFFF", light: "#1A1A1A" },
			name: { x: 150, y: 78, size: 50, tracking: -0.5, parts: [["Dav", 700], ["Code", 400]] },
			badge: {
				x: 372,
				y: 41,
				width: 106,
				height: 38,
				radius: 8,
				fill: { dark: "#FFFFFF", light: "#1A1A1A" },
				label: { x: 53, y: 19, size: 20, weight: 700, tracking: 2.5, fill: { dark: "#000000", light: "#FFFFFF" } },
			},
			/** the same four strokes in both canvases; the mark's group carries the shift */
			shapes: [
				{ tag: "polyline", points: "34,32 62,60 34,88", width: 11, tone: "accent" },
				{ tag: "line", x1: 80, y1: 32, x2: 80, y2: 88, width: 11, tone: "icon" },
				{ tag: "path", d: "M 80,32 C 128,32 128,88 80,88", width: 11, tone: "icon" },
				{ tag: "line", x1: 98, y1: 100, x2: 124, y2: 100, width: 9, tone: "accent" },
			],
		};

		/** One stroke in the colour the author gave that stroke for this scheme. */
		function strokeOf(shape, scheme) {
			return shape.tone === "accent" ? ART.accent[scheme] : ART.iconInk[scheme];
		}

		/** One shape of the icon, with the attributes it was drawn with. */
		function iconShape(shape, scheme, key) {
			const geometry =
				shape.tag === "polyline" ? { points: shape.points }
					: shape.tag === "line" ? { x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2 }
						: { d: shape.d };
			return jsx(shape.tag, {
				key,
				...geometry,
				fill: "none",
				stroke: strokeOf(shape, scheme),
				strokeWidth: shape.width,
				strokeLinecap: "round",
				strokeLinejoin: "round",
			});
		}

		/**
		 * The active colour scheme, as the layout presenter declares it: it writes
		 * `document.documentElement.style.colorScheme` from the composed theme's own
		 * `colorScheme` on every `theme/change` ("never the id — `system` is a preference"),
		 * so the attribute is the theme service's own answer, readable without a dependency
		 * on that service being mounted.
		 */
		function readScheme() {
			const declared = document.documentElement === null ? "" : document.documentElement.style.colorScheme;
			if (declared === "dark" || declared === "light") return declared;
			return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
		}

		/** The scheme every mounted artwork reads; one store, so a switch repaints them all. */
		let scheme;
		const schemeListeners = new Set();
		function currentScheme() {
			if (scheme === undefined) scheme = readScheme();
			return scheme;
		}
		function publishScheme() {
			const next = readScheme();
			if (next === currentScheme()) return;
			scheme = next;
			for (const listener of [...schemeListeners]) listener();
		}
		function useScheme() {
			const [value, setValue] = React.useState(currentScheme);
			React.useEffect(() => {
				const update = () => setValue(currentScheme());
				update();
				schemeListeners.add(update);
				return () => schemeListeners.delete(update);
			}, []);
			return value;
		}

		/**
		 * The mark on its own, for the collapsed rail and the toggle button: the author's
		 * square canvas, its group shift and its edge exactly as drawn, coloured for the
		 * scheme in force.
		 */
		function Mark({ size, className }) {
			const scheme = useScheme();
			return jsx("svg", {
				className,
				width: size,
				height: size,
				viewBox: ART.markBox.viewBox,
				fill: "none",
				role: "img",
				"aria-label": NAME,
				focusable: "false",
				"data-dsh-brand": "mark",
				children: jsx("g", {
					transform: ART.markBox.transform,
					children: ART.shapes.map((shape, index) => iconShape(shape, scheme, index)),
				}),
			});
		}

		/**
		 * The whole artwork — icon, name and badge — on the canvas it was drawn on. Nothing
		 * inside is computed: the name is the two drawn spans at the drawn size and place,
		 * and the badge is the drawn rectangle with the drawn label.
		 *
		 * It is used at two scales: the sidebar row and the blank-session screen, where the
		 * host asks for an edge and the canvas scales uniformly by that one factor.
		 */
		function Lockup({ size, className }) {
			const scheme = useScheme();
			const canvas = ART.canvas;
			return jsx("svg", {
				className,
				width: size * (canvas.width / canvas.height),
				height: size,
				viewBox: canvas.viewBox,
				fill: "none",
				role: "img",
				"aria-label": PRODUCT,
				"data-dsh-brand": "lockup",
				children: [
					jsx("g", {
						key: "icon",
						children: ART.shapes.map((shape, index) => iconShape(shape, scheme, "icon-" + index)),
					}),
					jsx("text", {
						key: "name",
						x: ART.name.x,
						y: ART.name.y,
						fontSize: ART.name.size,
						letterSpacing: ART.name.tracking,
						fontFamily: ART.font,
						fill: ART.nameInk[scheme],
						children: ART.name.parts.map(([text, weight]) =>
							jsx("tspan", { key: text, fontWeight: weight, children: text }),
						),
					}),
					jsx("g", {
						key: "badge",
						transform: "translate(" + ART.badge.x + ", " + ART.badge.y + ")",
						children: [
							jsx("rect", {
								key: "bg",
								width: ART.badge.width,
								height: ART.badge.height,
								rx: ART.badge.radius,
								fill: ART.badge.fill[scheme],
							}),
							jsx("text", {
								key: "label",
								x: ART.badge.label.x,
								y: ART.badge.label.y,
								textAnchor: "middle",
								dominantBaseline: "central",
								fontSize: ART.badge.label.size,
								fontWeight: ART.badge.label.weight,
								letterSpacing: ART.badge.label.tracking,
								fontFamily: ART.font,
								fill: ART.badge.label.fill[scheme],
								children: ROLE,
							}),
						],
					}),
				],
			});
		}

		/**
		 * The artwork as the sidebar row shows it. The row's brand box is 24px tall and clips
		 * symmetrically, and the drawn canvas is 120 units tall with the art itself between
		 * 26.5 and 104.5 — so 30 units is the scale at which the whole drawing is inside that
		 * box, with the drawn margins left and right as the author spaced them. It is a scale,
		 * never a move: no coordinate inside the artwork changes.
		 */
		const ROW_HEIGHT = 30;
		function RowLockup() {
			return jsx(Lockup, { size: ROW_HEIGHT });
		}

		/**
		 * The product name in the window title. The shipped layout composes
		 * `«session title» — «product»` and restores the bare product name otherwise, on every
		 * change, so the replacement follows whatever it writes.
		 */
		function watchTitle() {
			const rewrite = () => {
				const current = document.title;
				if (!current.includes(SHIPPED_PRODUCT)) return;
				document.title = current.split(SHIPPED_PRODUCT).join(PRODUCT);
			};
			rewrite();
			const observer = new MutationObserver(rewrite);
			const title = document.querySelector("title");
			if (title !== null) observer.observe(title, { childList: true, characterData: true, subtree: true });
			return () => observer.disconnect();
		}

		/**
		 * The mark as standalone markup, for the tab icon, where a data URI has no colour
		 * context to inherit: the dark pair of the drawing, on the dark ground the mark was
		 * drawn for.
		 */
		function iconMarkup() {
			const scheme = "dark";
			return ART.shapes
				.map((shape) => {
					const common = `stroke="${strokeOf(shape, scheme)}" stroke-width="${shape.width}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
					if (shape.tag === "polyline") return `<polyline points="${shape.points}" ${common}/>`;
					if (shape.tag === "line") {
						return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" ${common}/>`;
					}
					return `<path d="${shape.d}" ${common}/>`;
				})
				.join("");
		}

		/**
		 * The tab icon: the mark, on its own canvas, over the dark ground. The shipped page
		 * carries its own icon link and a browser may keep the one it read first, so that link
		 * is put aside rather than appended to, and put back when this pack is unloaded.
		 */
		function installTabIcon() {
			const edge = ART.markBox.edge;
			const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${edge} ${edge}"><rect width="${edge}" height="${edge}" rx="26" fill="#141414"/><g transform="${ART.markBox.transform}">${iconMarkup()}</g></svg>`;
			const shipped = Array.from(document.querySelectorAll('link[rel~="icon"]'));
			for (const link of shipped) link.remove();
			const link = document.createElement("link");
			link.rel = "icon";
			link.type = "image/svg+xml";
			link.href = "data:image/svg+xml," + encodeURIComponent(svg);
			link.dataset.plugin = "dsh-brand-davcode";
			document.head.append(link);
			return () => {
				link.remove();
				for (const original of shipped) document.head.append(original);
			};
		}

		/**
		 * The row carries the artwork, which already contains the icon. The separate mark seat
		 * exists for the collapsed rail, where the artwork is not shown, so it is hidden only
		 * while the artwork is actually laid out — measured, not assumed, so either way the app
		 * hides the name (unmounted or styled) leaves the rail with its icon.
		 */
		function watchSeats() {
			const reconcile = () => {
				for (const row of document.querySelectorAll('[class*="_logoRow"]')) {
					const lockup = row.querySelector('[data-dsh-brand="lockup"]');
					const shown = lockup !== null && lockup.getBoundingClientRect().width > 0;
					for (const mark of row.querySelectorAll('[class*="_brandMark"]')) {
						const hide = shown && !mark.contains(lockup);
						mark.style.display = hide ? "none" : "";
					}
				}
			};
			reconcile();
			const observer = new MutationObserver(reconcile);
			observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
			return () => {
				observer.disconnect();
				for (const mark of document.querySelectorAll('[class*="_brandMark"]')) mark.style.display = "";
			};
		}

		/**
		 * Follow the colour scheme the layout declares on the root element, so both canvases
		 * swap to the palette the author drew for the other ground. The media query is the
		 * fallback for a preference of `system` before the theme service has answered.
		 */
		function watchScheme() {
			const root = document.documentElement;
			const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : undefined;
			publishScheme();
			const observer = new MutationObserver(publishScheme);
			observer.observe(root, { attributes: true, attributeFilter: ["style", "class"] });
			if (media === undefined) return () => observer.disconnect();
			media.addEventListener("change", publishScheme);
			return () => {
				observer.disconnect();
				media.removeEventListener("change", publishScheme);
			};
		}

		/** Required service: the UI slot registry. */
		const inject = ["slots"];

		/**
		 * Take the brand seats the sidebar and the conversation hero declare, and keep the
		 * product name in the title and the tab. Every contribution is an owned effect:
		 * stopping, updating or unloading this pack gives the seats back to the shipped fish
		 * and restores the original title.
		 * @param ctx - client cordis context.
		 */
		function apply(ctx) {
			const slots = ctx.slots;

			ctx.effect(
				() =>
					slots.inject("sidebar.brand.mark", () =>
						slots.inject("sidebar.brand.name", function* () {
							yield slots.register({ name: "sidebar.brand.mark", priority: PRIORITY }, Mark);
							yield slots.register({ name: "sidebar.brand.name", priority: PRIORITY }, RowLockup);
						}),
					),
				"brand: sidebar row",
			);

			ctx.effect(
				() =>
					slots.inject("conversation.hero.brand.mark", () =>
						slots.register({ name: "conversation.hero.brand.mark", priority: PRIORITY }, Lockup),
					),
				"brand: new-session hero",
			);

			ctx.effect(() => watchTitle(), "brand: window title");
			ctx.effect(() => installTabIcon(), "brand: tab icon");
			ctx.effect(() => watchSeats(), "brand: rail and row");
			ctx.effect(() => watchScheme(), "brand: colour scheme");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
