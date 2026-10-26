import Button from "@/shared/ui/button";
import Icon from "@/shared/ui/icon";
import { toolbarStyles } from "@/shared/ui/toolbar/style.css";
import { Show, type Component } from "solid-js";
import type { ZipTieToolbarState } from "./types";

const GraphEditToolbar: Component<{
	zipTie: ZipTieToolbarState | undefined;
}> = (props) => <Show when={props.zipTie}>{(zipTie) =>
	<div class={toolbarStyles.root}>
		<div class={toolbarStyles.row}>
			<Button class={`${toolbarStyles.button} ${zipTie().active ? toolbarStyles.activeButton : ""}`} type="button"
				disabled={zipTie().disabled}
				onClick={zipTie().toggle}>
				<Icon name="link" size={17} />
			</Button>
		</div>
	</div>
}</Show>;

export default GraphEditToolbar;
