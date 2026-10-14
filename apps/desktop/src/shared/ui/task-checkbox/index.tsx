import { Show, type Component } from "solid-js";
import Icon from "@/shared/ui/icon";
import { styles } from "./style.css";

const TaskCheckbox: Component<{ checked: boolean; label: string; onChange?: (checked: boolean) => void }> = (props) =>
    <button type="button" role="checkbox" aria-checked={props.checked} aria-label={props.label}
        class={styles.checkbox} data-checked={props.checked} disabled={!props.onChange}
        onClick={() => props.onChange?.(!props.checked)}>
        <Show when={props.checked}><Icon name="check" size={14} /></Show>
    </button>;
export default TaskCheckbox;
