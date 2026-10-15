// Mounts the landscape once; everything after that is driven by the Landscape controller (no re-render per frame).
import { Component } from 'preact';
import { Landscape } from './landscape.js';
import './landscape.css';

export class LandscapeView extends Component<{ onReady: (land: Landscape | null) => void }> {
  private box: HTMLDivElement | null = null;
  private svg: SVGSVGElement | null = null;
  private bubble: HTMLDivElement | null = null;
  private land: Landscape | null = null;

  override shouldComponentUpdate(): boolean {
    return false;
  }
  override componentDidMount(): void {
    if (!this.box || !this.svg || !this.bubble) return;
    this.land = new Landscape(this.box, this.svg, this.bubble);
    this.props.onReady(this.land);
  }
  override componentWillUnmount(): void {
    this.land?.destroy();
    this.props.onReady(null);
  }
  override render() {
    return (
      <div
        class="landskap"
        id="landskap"
        aria-hidden="true"
        ref={(el) => {
          this.box = el;
        }}
      >
        <svg
          viewBox="0 0 400 200"
          preserveAspectRatio="xMidYMid meet"
          focusable="false"
          ref={(el) => {
            this.svg = el;
          }}
        />
        <div
          class="boble"
          ref={(el) => {
            this.bubble = el;
          }}
        />
      </div>
    );
  }
}
