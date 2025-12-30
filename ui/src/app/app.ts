import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { io } from 'socket.io-client';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent implements OnInit {
  private http = inject(HttpClient);
  private socket: any;

  // VIEW STATE
  mode = signal<'record' | 'replay' | 'report'>('record');

  // RECORD CONFIG
  isRecording = signal(false);
  recTarget = signal('http://localhost:8080');
  recPort = signal(3000);
  
  // Generation Config Mode
  genMode = signal<'manual' | 'config'>('manual');
  genConfigPath = signal('config.yaml');

  genSwagger = signal('./full_documentation.json');
  genExclude = signal(''); // Comma sep string
  // Methods selection
  genMethods = signal<{ [key: string]: boolean }>({ GET: true, POST: false, PUT: false, DELETE: false });
  
  message = signal('');
  liveLogs = signal<any[]>([]);

  // REPLAY CONFIG
  repEnv1 = signal('http://localhost:8080');
  repEnv2 = signal('http://localhost:8081');
  repAuth = signal('');
  repIgnore = signal('timestamp,id,_id,date');
  repExclude = signal('');

  // REPLAY STATE & REPORT DATA
  replayStats = signal({ current: 0, total: 0 });
  finalStats = signal({ passed: 0, failed: 0 });
  reportData = signal<any[]>([]);

  // Computed property for progress bar
  replayProgress = computed(() => {
    const s = this.replayStats();
    return s.total > 0 ? (s.current / s.total) * 100 : 0;
  });

  setMode(m: 'record' | 'replay' | 'report') {
    this.mode.set(m);
  }

  ngOnInit() {
    this.socket = io('http://localhost:4200');

    this.socket.on('record-log', (log: any) => {
      this.liveLogs.update((logs) => [log, ...logs].slice(0, 100));
    });

    this.socket.on('replay-event', (event: any) => {
      if (event.type === 'start') {
        this.replayStats.set({ current: 0, total: event.total });
        this.finalStats.set({ passed: 0, failed: 0 });
        this.reportData.set([]); // Clear previous report
      } else if (event.type === 'progress') {
        this.replayStats.update((s) => ({ ...s, current: event.current }));
      } else if (event.type === 'complete') {
        this.finalStats.set({ passed: event.passed, failed: event.failed });

        // --- KEY CHANGE: Receive results array directly ---
        if (event.results) {
          this.reportData.set(event.results);
          this.mode.set('report'); // Auto-switch to report tab
        }
      }
    });

    this.socket.on('record-stopped', () => {
      this.isRecording.set(false);
      alert('Traffic Generation Complete! Recorder stopped.');
    });
  }

  startRecord() {
    this.http
      .post('http://localhost:4200/api/record/start', {
        target: this.recTarget(),
        port: this.recPort(),
        file: 'ui-traffic.jsonl',
      })
      .subscribe(() => this.isRecording.set(true));
  }

  stopRecord() {
    this.http
      .post('http://localhost:4200/api/record/stop', {})
      .subscribe(() => this.isRecording.set(false));
  }

  onGenerateTraffic() {
    let payload: any = {
      port: this.recPort(),
      methods: Object.keys(this.genMethods()).filter(m => this.genMethods()[m]) // Send selected methods
    };

    if (this.genMode() === 'config') {
      payload.configPath = this.genConfigPath();
      payload.target = this.recTarget();
    } else {
      // Splits "path1, path2" into ["path1", "path2"]
      const excludeList = this.genExclude()
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);

      payload.proxyUrl = `http://localhost:${this.recPort()}`;
      payload.target = this.recTarget();
      payload.swaggerFile = this.genSwagger();
      payload.exclude = excludeList;
    }

    this.http
      .post('http://localhost:4200/api/generate', payload)
      .subscribe();
  }

  startReplay() {
    const excludeList = this.repExclude()
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s);
    const ignoreList = this.repIgnore()
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s);

    this.http
      .post('http://localhost:4200/api/replay', {
        file: 'ui-traffic.jsonl',
        env1: this.repEnv1(),
        env2: this.repEnv2(),
        auth: this.repAuth(),
        ignore: ignoreList,
        exclude: excludeList, // Send to backend
      })
      .subscribe();
  }
}
