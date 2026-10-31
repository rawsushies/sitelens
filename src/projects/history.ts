/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens History Engine - Robust Immutable Undo/Redo Manager
 */

import { SiteFeature } from '../types';

export interface HistorySnapshot {
  features: SiteFeature[];
  activeFeatureId: string | null;
}

/**
 * Manages an immutable transaction stack for CAD/GIS geometry operations
 * Prevents no-op pollution, deep-clones snapshots, and coordinates undo/redo
 */
export class HistoryManager {
  private past: HistorySnapshot[] = [];
  private future: HistorySnapshot[] = [];
  private readonly maxDepth: number;

  constructor(maxDepth = 30) {
    this.maxDepth = maxDepth;
  }

  /**
   * Deep clones a snapshot to prevent reference mutation
   */
  private clone(snapshot: HistorySnapshot): HistorySnapshot {
    return {
      features: JSON.parse(JSON.stringify(snapshot.features)),
      activeFeatureId: snapshot.activeFeatureId,
    };
  }

  /**
   * Deep equality check for feature collections to prevent no-op pollution
   */
  private areFeaturesEqual(a: SiteFeature[], b: SiteFeature[]): boolean {
    if (a.length !== b.length) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /**
   * Pushes a new snapshot to history if it represents an actual change
   */
  public push(current: HistorySnapshot): boolean {
    // Prevent no-op operations from polluting history
    if (this.past.length > 0) {
      const top = this.past[this.past.length - 1];
      if (this.areFeaturesEqual(top.features, current.features)) {
        return false;
      }
    }

    this.past.push(this.clone(current));
    if (this.past.length > this.maxDepth) {
      this.past.shift();
    }
    // Any new committed action invalidates the redo stack
    this.future = [];
    return true;
  }

  public canUndo(): boolean {
    return this.past.length > 0;
  }

  public canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Undoes the last operation, recording the current state into the redo stack
   */
  public undo(current: HistorySnapshot): HistorySnapshot | null {
    if (!this.canUndo()) return null;
    const previous = this.past.pop()!;
    this.future.unshift(this.clone(current));
    return this.clone(previous);
  }

  /**
   * Redoes the previously undone operation, recording the current state into the undo stack
   */
  public redo(current: HistorySnapshot): HistorySnapshot | null {
    if (!this.canRedo()) return null;
    const next = this.future.shift()!;
    this.past.push(this.clone(current));
    return this.clone(next);
  }

  /**
   * Clears the transaction history
   */
  public clear(): void {
    this.past = [];
    this.future = [];
  }

  public getUndoCount(): number {
    return this.past.length;
  }

  public getRedoCount(): number {
    return this.future.length;
  }
}
