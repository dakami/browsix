/// <reference path="../../typings/node/node.d.ts" />

'use strict';

import { ConnectCallback, SyscallContext, IFile, ITask } from './types';
import { Pipe } from './pipe';

export interface AcceptCallback {
	(err: any, s?: SocketFile, remoteAddr?: string, remotePort?: number): void;
}

export function isSocket(f: IFile): f is SocketFile {
	return f instanceof SocketFile;
}

export interface Incoming {
	s: SocketFile;
	addr: string;
	port: number;
	cb: ConnectCallback;
}

export class SocketFile implements IFile {
	task:          ITask;
	isListening:   boolean    = false;
	parent:        SocketFile = undefined;

	outgoing:      Pipe = undefined;
	incoming:      Pipe = undefined;

	incomingQueue: Incoming[] = [];
	acceptQueue:   AcceptCallback[] = [];

	constructor(task: ITask) {
		this.task = task;
	}

	stat(cb: (err: any, stats: any) => void): void {
		throw new Error('TODO: SocketFile.stat not implemented');
	}

	listen(cb: (err: any) => void): void {
		this.isListening = true;
		cb(undefined);
	}

	accept(cb: AcceptCallback): void {
		if (!this.incomingQueue.length) {
			this.acceptQueue.push(cb);
			return;
		}

		let queued = this.incomingQueue.shift();

		let remote = queued.s;
		let local = new SocketFile(this.task);

		let outgoing = new Pipe();
		let incoming = new Pipe();

		local.outgoing = outgoing;
		remote.incoming = outgoing;

		local.incoming = incoming;
		remote.outgoing = incoming;

		cb(null, local, queued.addr, queued.port);
		queued.cb(null);
	}

	doAccept(remote: SocketFile, remoteAddr: string, remotePort: number, cb: ConnectCallback): void {
		if (!this.acceptQueue.length) {
			this.incomingQueue.push({
				s: remote,
				addr: remoteAddr,
				port: remotePort,
				cb: cb,
			});
			return;
		}

		let acceptCB = this.acceptQueue.shift();

		let local = new SocketFile(this.task);

		let outgoing = new Pipe();
		let incoming = new Pipe();

		local.outgoing = outgoing;
		remote.incoming = outgoing;

		local.incoming = incoming;
		remote.outgoing = incoming;

		acceptCB(null, local, remoteAddr, remotePort);
		cb(null);
	}

	connect(addr: string, port: number, cb: ConnectCallback): void {
		this.task.kernel.connect(this, addr, port, cb);
	}

	write(buf: string|Buffer, cb: (err: any, len?: number) => void): void {
		if (typeof buf === 'string')
			this.outgoing.write(buf);
		else
			this.outgoing.writeBuffer((<Buffer>buf));
		cb(undefined, buf.length);
	}

	read(buf: Buffer, pos: number, len: number, off: number, cb: (err: any, len?: number) => void): void {
		this.incoming.read(buf, pos, len, off, cb);
	}

	readSync(): string {
		return this.incoming.readSync();
	}

	ref(): void {
		if (this.outgoing)
			this.outgoing.ref();
		if (this.incoming)
			this.incoming.ref();
	}

	unref(): void {
		if (this.outgoing)
			this.outgoing.unref();
		if (this.incoming)
			this.incoming.unref();
	}
}
