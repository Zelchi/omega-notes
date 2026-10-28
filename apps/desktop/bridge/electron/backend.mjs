import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

const MAX_MESSAGE = 256 * 1024 * 1024;
export class Backend {
    #child;
    #pending = new Map();
    #nextId = 0;
    #stopping = false;
    #ready;
    #exit;
    #failure;
    constructor(executable, args, emit, failed = console.error) {
        this.#child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
        this.#exit = new Promise(resolve => this.#child.once('close', resolve));
        this.#ready = new Promise((resolve, reject) => {
            const startup = setTimeout(() => { reject(new Error('Backend startup timed out')); this.#child.kill(); }, 30_000);
            const decoder = new StringDecoder('utf8');
            let buffered = '';
            const fail = error => {
                if (this.#failure) return;
                this.#failure = error;
                clearTimeout(startup);
                reject(error);
                for (const request of this.#pending.values()) { clearTimeout(request.timeout); request.reject(error); }
                this.#pending.clear();
                if (!this.#stopping) failed(error);
            };
            this.#child.on('error', fail);
            this.#child.on('close', code => fail(new Error(`Backend exited (${code ?? 'signal'})`)));
            this.#child.stdin.on('error', fail);
            this.#child.stderr.on('data', bytes => process.stderr.write(bytes));
            this.#child.stdout.on('data', bytes => {
                buffered += decoder.write(bytes);
                if (buffered.length > MAX_MESSAGE) { fail(new Error('Backend response too large')); this.#child.kill(); return; }
                let index;
                while ((index = buffered.indexOf('\n')) >= 0) {
                    const line = buffered.slice(0, index); buffered = buffered.slice(index + 1);
                    let message;
                    try { message = JSON.parse(line); } catch { fail(new Error('Invalid backend response')); this.#child.kill(); return; }
                    if (message.ready === true) { clearTimeout(startup); resolve(); }
                    else if (typeof message.event === 'string' || typeof message.channel === 'string') emit(message);
                    else if (Number.isSafeInteger(message.id)) {
                        const request = this.#pending.get(message.id);
                        if (!request) continue;
                        clearTimeout(request.timeout); this.#pending.delete(message.id);
                        if (typeof message.error === 'string') request.reject(new Error(message.error));
                        else request.resolve(message.result);
                    } else if (message.protocolError) { fail(new Error(message.protocolError)); this.#child.kill(); return; }
                }
            });
        });
        this.#ready.catch(() => { });
    }
    async ready() { await this.#ready; }
    async invoke(command, args = {}) {
        await this.#ready;
        if (this.#failure) throw this.#failure;
        if (this.#stopping) throw new Error('Backend is stopping');
        if (this.#pending.size >= 128) throw new Error('Too many backend requests');
        const id = ++this.#nextId;
        const message = JSON.stringify({ id, command, args }) + '\n';
        if (Buffer.byteLength(message) > MAX_MESSAGE) throw new Error('Backend request too large');
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { this.#pending.delete(id); reject(new Error(`Backend timeout: ${command}`)); }, 15 * 60_000);
            this.#pending.set(id, { resolve, reject, timeout });
            this.#child.stdin.write(message, error => {
                if (!error) return;
                clearTimeout(timeout); this.#pending.delete(id); reject(error);
            });
        });
    }
    async stop() {
        if (this.#stopping) return this.#exit;
        this.#stopping = true;
        this.#child.stdin.end();
        const kill = setTimeout(() => this.#child.kill(), 5000);
        await this.#exit;
        clearTimeout(kill);
    }
}
