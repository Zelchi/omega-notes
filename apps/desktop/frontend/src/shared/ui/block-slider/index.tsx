import Input from "@/shared/ui/input";
import { For, type Component } from "solid-js";
import { styles } from "./style.css";

type Props = {
    id: string;
    value: number;
    onChange: (value: number) => void;
};

const BlockSlider: Component<Props> = (props) => {
    const level = () => Math.round(Math.max(0, Math.min(1, props.value)) * 10);

    return (
        <div class={styles.root}>
            <div class={styles.blocks} aria-hidden="true">
                <For each={Array.from({ length: 10 }, (_, index) => index)}>
                    {(index) => <span class={styles.block} classList={{ [styles.active]: index < level() }} />}
                </For>
            </div>
            <Input
                id={props.id}
                class={styles.input}
                type="range"
                min="0"
                max="10"
                step="1"
                value={level()}
                aria-valuetext={`${level() * 10}%`}
                onInput={(event) => props.onChange(Number(event.currentTarget.value) / 10)}
            />
        </div>
    );
};

export default BlockSlider;
