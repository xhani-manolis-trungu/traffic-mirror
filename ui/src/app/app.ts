import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { io } from 'socket.io-client';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container">
      <header>
        <h1>🚦 Traffic Mirror <span class="badge">v1.0.0 UI</span></h1>
        <div class="tabs">
          <button [class.active]="mode() === 'record'" (click)="setMode('record')">
            🔴 Record / Gen
          </button>
          <button [class.active]="mode() === 'replay'" (click)="setMode('replay')">
            ▶️ Replay
          </button>
          <button [class.active]="mode() === 'report'" (click)="setMode('report')">
            📄 Report
          </button>
        </div>
      </header>

      @if (mode() === 'record') {
        <div class="panel">
          <h3>Configuration</h3>
          <div class="controls grid">
            <label
              >Target URL (Proxy Destination)
              <input [(ngModel)]="recTarget" placeholder="http://localhost:8080" />
            </label>
            <label
              >Recorder Port
              <input [(ngModel)]="recPort" type="number" placeholder="3000" />
            </label>
          </div>

          <div class="controls grid">
            <label
              >Swagger File Path (for Generation)
              <input [(ngModel)]="genSwagger" placeholder="./full_documentation.json" />
            </label>
            <label
              >Exclude Endpoints (Generate & Record)
              <input [(ngModel)]="genExclude" placeholder="/logout, /health" />
            </label>
          </div>

          <div class="actions">
            @if (!isRecording()) {
              <button class="btn-primary" (click)="startRecord()">Start Manually</button>
              <button class="btn-warning" (click)="onGenerateTraffic()">
                ⚡ Auto-Generate Traffic
              </button>
            } @else {
              <button class="btn-danger full-width" (click)="stopRecord()">Stop Recording</button>
            }
          </div>

          <div class="logs-window">
            @for (log of liveLogs(); track log.timestamp) {
              <div class="log-line">
                <span class="method" [ngClass]="log.method">{{ log.method }}</span>
                <span class="url">{{ log.url }}</span>
              </div>
            } @empty {
              <div class="placeholder">Waiting for traffic...</div>
            }
          </div>
        </div>
      }

      @if (mode() === 'replay') {
        <div class="panel">
          <div class="controls grid">
            <label
              >Primary Env (Stable)
              <input [(ngModel)]="repEnv1" placeholder="http://localhost:8080" />
            </label>
            <label
              >Secondary Env (Test)
              <input [(ngModel)]="repEnv2" placeholder="http://localhost:8081" />
            </label>
          </div>

          <div class="controls grid">
            <label
              >Auth Header (Optional)
              <input [(ngModel)]="repAuth" placeholder="Bearer eyJ..." />
            </label>
            <label
              >Ignore JSON Fields
              <input [(ngModel)]="repIgnore" placeholder="timestamp, id, _id" />
            </label>
          </div>

          <div class="controls">
            <label style="width:100%"
              >Exclude Endpoints (Replay)
              <input
                [(ngModel)]="repExclude"
                placeholder="/admin, /reset-password"
                style="width:100%"
              />
            </label>
          </div>

          <button class="btn-primary full-width" (click)="startReplay()">
            🚀 Replay & Compare
          </button>

          @if (replayProgress() > 0) {
            <div class="progress-bar">
              <div class="fill" [style.width.%]="replayProgress()"></div>
            </div>
            <p style="text-align: center; margin-top: 5px;">
              {{ replayStats().current }} / {{ replayStats().total }} requests
            </p>
          }
        </div>
      }

      @if (mode() === 'report') {
        <div class="panel">
          <div class="summary-box">
            <div class="stat success">✅ Passed: {{ finalStats().passed }}</div>
            <div class="stat fail">❌ Failed: {{ finalStats().failed }}</div>
          </div>

          @if (reportData().length === 0) {
            <div class="placeholder" style="color: #7f8c8d; text-align: center; padding: 20px;">
              No report data available. Run a Replay first.
            </div>
          }

          @for (item of reportData(); track item.id) {
            <details>
              <summary [class.fail-card]="!item.match">Details
                <span class="method" [ngClass]="item.method">{{ item.method }}</span>
                <span class="url">{{ item.url }}</span>
              </summary>

              <div class="card" [class.fail-card]="!item.match">
                <div class="card-header">
                  <span class="method" [ngClass]="item.method">{{ item.method }}</span>
                  <span class="url">{{ item.url }}</span>
                  <span class="status-badge" [class.success]="item.match" [class.fail]="!item.match">
                    {{ item.status1 }} vs {{ item.status2 }}
                  </span>
                </div>
  
                @if (!item.match && item.diff) {
                  <div class="diff-view">
                    <pre>@for (part of item.diff; track $index) {<span [class.added]="part.added" [class.removed]="part.removed">{{part.value}}</span>}</pre>
                  </div>
                }
              </div>
            </details>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .container {
        max-width: 900px;
        margin: 0 auto;
        font-family: 'Segoe UI', sans-serif;
        padding-bottom: 50px;
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        border-bottom: 2px solid #eee;
        padding-bottom: 10px;
      }
      .badge {
        font-size: 0.5em;
        background: #8e44ad;
        color: white;
        padding: 2px 5px;
        border-radius: 4px;
        vertical-align: middle;
      }

      .tabs {
        display: flex;
        gap: 10px;
      }
      .tabs button {
        background: none;
        border: none;
        font-size: 1rem;
        padding: 8px 12px;
        cursor: pointer;
        opacity: 0.6;
        border-radius: 4px;
      }
      .tabs button.active {
        opacity: 1;
        background: #e1f0fa;
        color: #2980b9;
        font-weight: bold;
      }

      .panel {
        background: #fff;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
      }

      .controls {
        gap: 15px;
        margin-bottom: 15px;
      }
      .controls.grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }
      label {
        font-size: 0.85rem;
        font-weight: 600;
        color: #7f8c8d;
        display: block;
        margin-bottom: 5px;
      }
      input {
        width: 100%;
        box-sizing: border-box;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 6px;
        outline: none;
      }
      input:focus {
        border-color: #3498db;
      }

      .actions {
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
      }
      .btn-primary {
        background: #3498db;
        color: white;
        border: none;
        padding: 12px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
      }
      .btn-warning {
        background: #f39c12;
        color: white;
        border: none;
        padding: 12px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
      }
      .btn-danger {
        background: #e74c3c;
        color: white;
        border: none;
        padding: 12px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
      }
      .full-width {
        width: 100%;
      }

      .logs-window {
        background: #2c3e50;
        color: #ecf0f1;
        height: 300px;
        overflow-y: auto;
        padding: 15px;
        border-radius: 6px;
        font-family: monospace;
        font-size: 0.85rem;
      }
      .log-line {
        margin-bottom: 5px;
        padding-bottom: 5px;
        border-bottom: 1px solid #34495e;
        display: flex;
        align-items: center;
      }

      .method {
        font-weight: bold;
        margin-right: 10px;
        padding: 2px 6px;
        border-radius: 3px;
        color: white;
        font-size: 0.7em;
        min-width: 45px;
        text-align: center;
        display: inline-block;
      }
      .method.GET {
        background: #3498db;
      }
      .method.POST {
        background: #27ae60;
      }
      .method.PUT {
        background: #f39c12;
      }
      .method.DELETE {
        background: #c0392b;
      }

      /* Report Styles */
      .summary-box {
        display: flex;
        gap: 20px;
        margin-bottom: 20px;
      }
      .stat {
        flex: 1;
        padding: 15px;
        border-radius: 6px;
        font-weight: bold;
        text-align: center;
        color: white;
      }
      .stat.success {
        background: #2ecc71;
      }
      .stat.fail {
        background: #e74c3c;
      }

      .card {
        border: 1px solid #eee;
        margin-bottom: 10px;
        border-radius: 6px;
        overflow: hidden;
      }
      .card-header {
        padding: 10px 15px;
        background: #f9f9f9;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .fail-card {
        border-left: 5px solid #e74c3c;
      }

      .status-badge {
        font-weight: bold;
        font-size: 0.9em;
      }
      .status-badge.fail {
        color: #e74c3c;
      }
      .status-badge.success {
        color: #2ecc71;
      }

      .diff-view {
        background: #2c3e50;
        color: #ecf0f1;
        padding: 15px;
        font-family: monospace;
        overflow-x: auto;
        white-space: pre-wrap;
      }
      .added {
        background-color: #2ecc71;
        color: #000;
      }
      .removed {
        background-color: #e74c3c;
        color: #fff;
        text-decoration: line-through;
      }

      .progress-bar {
        height: 10px;
        background: #eee;
        border-radius: 5px;
        overflow: hidden;
        margin-top: 15px;
      }
      .fill {
        height: 100%;
        background: #3498db;
        transition: width 0.3s;
      }
    `,
  ],
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
  genSwagger = signal('./full_documentation.json');
  genExclude = signal(''); // Comma sep string
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
    // Splits "path1, path2" into ["path1", "path2"]
    const excludeList = this.genExclude()
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s);

    this.http
      .post('http://localhost:4200/api/generate', {
        proxyUrl: `http://localhost:${this.recPort()}`, // Dynamic Proxy URL based on port
        target: this.recTarget(), // <--- NEW: Send the real target (e.g. localhost:8080)
        port: this.recPort(), // <--- NEW: Send the port to listen on
        swaggerFile: this.genSwagger(),
        exclude: excludeList,
      })
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
