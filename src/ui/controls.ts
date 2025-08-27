import type { UIElements } from '../types';
import type { RenderMode } from '../constants';

export class UIController {
  private elements: UIElements;

  constructor() {
    this.elements = this.getUIElements();
    this.initializeButtonStates();
  }

  private getUIElements(): UIElements {
    const densitySlider = document.getElementById('density-slider') as HTMLInputElement;
    const densityValueLabel = document.getElementById('density-value') as HTMLElement;
    const pauseButton = document.getElementById('pause-toggle') as HTMLButtonElement;
    const adaptiveButton = document.getElementById('adaptive-toggle') as HTMLButtonElement;
    const modeButton = document.getElementById('mode-toggle') as HTMLButtonElement;
    const impostorButton = document.getElementById('impostor-toggle') as HTMLButtonElement;
    const cullButton = document.getElementById('cull-toggle') as HTMLButtonElement;
    const clearButton = document.getElementById('clear-button') as HTMLButtonElement;
    const fpsCounter = document.getElementById('fps-counter') as HTMLElement;

    if (!densitySlider || !densityValueLabel || !pauseButton || !adaptiveButton || 
        !modeButton || !impostorButton || !cullButton || !clearButton || !fpsCounter) {
      throw new Error('Required UI elements not found');
    }

    return {
      densitySlider,
      densityValueLabel,
      pauseButton,
      adaptiveButton,
      modeButton,
      impostorButton,
      cullButton,
      clearButton,
      fpsCounter
    };
  }

  private initializeButtonStates(): void {
    this.elements.pauseButton.textContent = 'Pause';
    this.elements.adaptiveButton.textContent = 'Adaptive Off';
    this.elements.modeButton.textContent = 'Mode: Instanced';
    this.elements.impostorButton.textContent = 'Impostor: Off';
    this.elements.cullButton.textContent = 'Cull: Off';
  }

  public setupDensitySlider(callback: (value: number) => void): void {
    this.elements.densitySlider.addEventListener('input', (event) => {
      const value = parseInt((event.target as HTMLInputElement).value);
      this.elements.densityValueLabel.textContent = value.toString();
      callback(value);
    });
  }

  public setupOrbitalButtons(callback: (orbitalType: string) => void): void {
    const buttons = document.querySelectorAll('[data-orbital]') as NodeListOf<HTMLButtonElement>;
    
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        // Remove active class from all buttons
        buttons.forEach(btn => btn.classList.remove('active'));
        // Add active class to clicked button
        button.classList.add('active');
        
        const orbitalType = button.getAttribute('data-orbital');
        if (orbitalType) {
          callback(orbitalType);
        }
      });
    });

    // Set initial active state
    const firstButton = document.querySelector('[data-orbital="1s"]');
    if (firstButton) {
      firstButton.classList.add('active');
    }
  }

  public setupPauseButton(callback: (paused: boolean) => void): void {
    let paused = false;
    this.elements.pauseButton.addEventListener('click', () => {
      paused = !paused;
      this.elements.pauseButton.textContent = paused ? 'Resume' : 'Pause';
      callback(paused);
    });
  }

  public setupAdaptiveButton(callback: (enabled: boolean) => void): void {
    let adaptiveEnabled = false;
    this.elements.adaptiveButton.addEventListener('click', () => {
      adaptiveEnabled = !adaptiveEnabled;
      this.elements.adaptiveButton.textContent = adaptiveEnabled ? 'Adaptive On' : 'Adaptive Off';
      callback(adaptiveEnabled);
    });
  }

  public setupModeButton(callback: (mode: RenderMode) => void): void {
    const modes: RenderMode[] = ['instanced', 'points', 'gpu'];
    let currentModeIndex = 0;

    this.elements.modeButton.addEventListener('click', () => {
      currentModeIndex = (currentModeIndex + 1) % modes.length;
      const mode = modes[currentModeIndex];
      
      this.elements.modeButton.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
      callback(mode);
    });
  }

  public setupImpostorButton(callback: (enabled: boolean) => void): void {
    let impostorEnabled = false;
    this.elements.impostorButton.addEventListener('click', () => {
      impostorEnabled = !impostorEnabled;
      this.elements.impostorButton.textContent = impostorEnabled ? 'Impostor: On' : 'Impostor: Off';
      callback(impostorEnabled);
    });
  }

  public setupCullButton(callback: (enabled: boolean) => void): void {
    let occlusionEnabled = false;
    this.elements.cullButton.addEventListener('click', () => {
      occlusionEnabled = !occlusionEnabled;
      this.elements.cullButton.textContent = occlusionEnabled ? 'Cull: On' : 'Cull: Off';
      callback(occlusionEnabled);
    });
  }

  public setupClearButton(callback: () => void): void {
    this.elements.clearButton.addEventListener('click', callback);
  }

  public updateFPS(fps: number): void {
    this.elements.fpsCounter.textContent = `FPS: ${Math.round(fps)}`;
  }

  public getDensityValue(): number {
    return parseInt(this.elements.densitySlider.value);
  }
}