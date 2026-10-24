import { Show, type Component } from "solid-js";
import type { useCustomScrollArea } from "./controller";
import { styles } from "./style.css.ts";

const CustomScrollbars: Component<{ scroll: ReturnType<typeof useCustomScrollArea>; compact?: boolean }> = (props) => {
	const scroll = props.scroll;
	return <>
			<Show when={scroll.metrics().scrollHeight > scroll.metrics().clientHeight + 1}>
				<div
					class={styles.verticalTrack}
					style={props.compact ? { top: "2px", bottom: "2px" } : undefined}
					onPointerDown={(event) => scroll.onTrackPointerDown(event, "vertical")}
				>
					<div
						class={styles.verticalThumb}
						role="scrollbar"
						aria-orientation="vertical"
						aria-valuemin={0}
						aria-valuemax={Math.round(scroll.thumb("vertical").maxScroll)}
						aria-valuenow={Math.round(scroll.metrics().top)}
						tabIndex={0}
						style={{
							"min-height": props.compact ? "8px" : undefined,
							height: `${scroll.thumb("vertical").length}px`,
							transform: `translateY(${scroll.thumb("vertical").offset}px)`,
						}}
						onPointerDown={(event) => scroll.beginDrag(event, "vertical")}
						onKeyDown={(event) => scroll.onScrollbarKeyDown(event, "vertical")}
					/>
				</div>
			</Show>
			<Show when={scroll.metrics().scrollWidth > scroll.metrics().clientWidth + 1}>
				<div
					class={styles.horizontalTrack}
					style={props.compact ? { left: "2px", right: "2px" } : undefined}
					onPointerDown={(event) => scroll.onTrackPointerDown(event, "horizontal")}
				>
					<div
						class={styles.horizontalThumb}
						role="scrollbar"
						aria-orientation="horizontal"
						aria-valuemin={0}
						aria-valuemax={Math.round(scroll.thumb("horizontal").maxScroll)}
						aria-valuenow={Math.round(scroll.metrics().left)}
						tabIndex={0}
						style={{
							"min-width": props.compact ? "8px" : undefined,
							width: `${scroll.thumb("horizontal").length}px`,
							transform: `translateX(${scroll.thumb("horizontal").offset}px)`,
						}}
						onPointerDown={(event) => scroll.beginDrag(event, "horizontal")}
						onKeyDown={(event) => scroll.onScrollbarKeyDown(event, "horizontal")}
					/>
				</div>
			</Show>
	</>;
};

export default CustomScrollbars;
