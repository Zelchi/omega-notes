import { type Component, type JSX } from "solid-js";
import { useCustomScrollArea } from "./controller";
import { styles } from "./style.css.ts";
import CustomScrollbars from "./scrollbars";

type Props = {
	children: JSX.Element;
	class?: string;
	contentClass?: string;
	viewportStyle?: JSX.CSSProperties;
	zeroVerticalPadding?: boolean;
	centerContentVertically?: boolean;
	fitContent?: boolean;
	ariaLabel?: string;
	accelerateScrollWithAlt?: boolean;
	viewportRef?: (element: HTMLDivElement) => void;
	onScroll?: (element: HTMLDivElement) => void;
};

const CustomScrollArea: Component<Props> = (props) => {
	const scroll = useCustomScrollArea({ accelerateScrollWithAlt: () => Boolean(props.accelerateScrollWithAlt) });

	return (
		<div class={`${styles.root} ${props.class ?? ""} ${props.fitContent ? styles.fitContentRoot : ""}`} ref={scroll.setRoot} data-omega-scroll-root
			onPointerMove={scroll.moveThumb}
			onPointerUp={scroll.finishDrag}
			onPointerCancel={scroll.finishDrag}
			onLostPointerCapture={scroll.finishDrag}
		>
			<div
				class={`${styles.viewport} ${props.fitContent ? styles.fitContentViewport : ""} ${props.zeroVerticalPadding ? styles.zeroVerticalPadding : ""}`}
				ref={(element) => { scroll.setViewport(element); props.viewportRef?.(element); }}
				style={props.viewportStyle}
				data-omega-scroll-viewport=""
				aria-label={props.ariaLabel}
				tabIndex={0}
				onScroll={(event) => { scroll.updateMetrics(); props.onScroll?.(event.currentTarget); }}
			>
				<div class={`${styles.content} ${props.contentClass ?? ""} ${props.fitContent ? styles.fitContent : ""} ${props.centerContentVertically ? styles.centerContentVertically : ""}`} ref={scroll.setContent} data-omega-scroll-content>
					{props.children}
				</div>
			</div>
			<CustomScrollbars scroll={scroll} />
		</div>
	);
};

export default CustomScrollArea;

export { useCustomScrollArea } from "./controller";
export { default as CustomScrollbars } from "./scrollbars";
