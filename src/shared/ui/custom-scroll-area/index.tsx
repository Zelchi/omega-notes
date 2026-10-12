import { Show, type Component, type JSX } from "solid-js";
import { useCustomScrollArea } from "./controller";
import { styles } from "./style.css.ts";

type Props = { children: JSX.Element };

const CustomScrollArea: Component<Props> = (props) => {
	const scroll = useCustomScrollArea();

	return (
		<div class={styles.root} ref={scroll.setRoot} data-omega-scroll-root
			onPointerMove={scroll.moveThumb}
			onPointerUp={scroll.finishDrag}
			onPointerCancel={scroll.finishDrag}
			onLostPointerCapture={scroll.finishDrag}
		>
			<div
				class={styles.viewport}
				ref={scroll.setViewport}
				data-omega-scroll-viewport=""
				tabIndex={0}
				onScroll={scroll.updateMetrics}
			>
				<div class={styles.content} ref={scroll.setContent} data-omega-scroll-content>
					{props.children}
				</div>
			</div>
			<Show when={scroll.metrics().scrollHeight > scroll.metrics().clientHeight + 1}>
				<div
					class={styles.verticalTrack}
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
							width: `${scroll.thumb("horizontal").length}px`,
							transform: `translateX(${scroll.thumb("horizontal").offset}px)`,
						}}
						onPointerDown={(event) => scroll.beginDrag(event, "horizontal")}
						onKeyDown={(event) => scroll.onScrollbarKeyDown(event, "horizontal")}
					/>
				</div>
			</Show>
		</div>
	);
};

export default CustomScrollArea;
