/*
Copyright 2021 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { ReactiveElement } from 'lit';
import { property, eventOptions } from 'lit/decorators.js';
import { ResizeController } from '@lit-labs/observers/resize_controller.js';

function debounce(inputFunction: Function, delay: number = 0): Function {
    let timeoutId: any;
    return (...args: any): void => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout((): void => {
            timeoutId = null;
            inputFunction(...args);
        }, delay);
    };
}

type Constructor<T = Record<string, unknown>> = {
    new (...args: any[]): T;
    prototype: T;
};

export type Breakpoints = Map<string, number>;

export interface ContainerQueryInterface {
    resizeTarget: Element;
    resizeDelay: number;
    breakpoints: Breakpoints;
    container: string[];
    containerInit: Function | undefined;
    onResize: Function | undefined;
    validateResize: Function;
}

/**
 * @element ue-mixins
 */
export function ContainerQueryMixin<T extends Constructor<ReactiveElement>>(
    constructor: T,
    {
        observe = true,
        customBreakpoints = undefined,
    }: {
        observe?: boolean;
        customBreakpoints?: Breakpoints;
    } = {}
): T & Constructor<ContainerQueryInterface> {
    class ContainerQueryElement extends constructor {
        /**
         * Defines the element(s) to be targeted by the container query.
         */
        @property({ attribute: false })
        public resizeTarget: Element = this;

        @property({ attribute: false })
        public resizeDelay: number = 500;

        /**
         A map of breakpoint names assigned to their corresponding pixel widths
        */
        private _breakpoints: Breakpoints =
            customBreakpoints ||
            new Map([
                ['xl', 2160],
                ['l', 1768],
                ['m', 1280],
                ['s', 768],
                ['xs', 304],
                ['xxs', 0], // 0-303px
            ]);

        /**
         * Sorts breakpoints highest to lowest based on their pixel value
         * @param a - A numeric value representing the pixel value of a breakpoint
         * @param b - A numeric value representing the pixel value of a breakpoint
         */
        private _sortByBreakpoint(a: number, b: number): number {
            if (a > b) return -1;
            if (a < b) return 1;
            return 0;
        }

        @property({ type: Map, attribute: false })
        public get breakpoints() {
            return this._breakpoints;
        }

        public set breakpoints(value: Breakpoints) {
            if (!value) return;

            /* Sort breakpoints by value */
            this._breakpoints = new Map([...value.entries()].sort((a, b) => this._sortByBreakpoint(a[1], b[1])));
        }

        /**
         * Array of breakpoint labels that are currently active for this element
         */
        private _container: string[] = [];

        @property({ attribute: false })
        public get container(): string[] {
            return this._container;
        }

        public set container(input: string[]) {
            /* Assign any values also in the breakpoints map to the container array */
            let cleanInput = input.filter(bp => this.breakpoints.has(bp));

            /* Sort the array by breakpoints and assign to the container array */
            this._container = cleanInput.sort((a, b) => this._sortByBreakpoint(this.breakpoints.get(a)!, this.breakpoints.get(b)!));

            /* Store the previous state of breakpoint attributes */
            const previous: string[] = this.resizeTarget.getAttributeNames().filter((attr: string) => this.breakpoints.has(attr));

            /* Add/remove attributes representing the breakpoints in the container array */
            /* If the previous value set is not empty, check breakpoint attributes for updates */
            if (previous.length > 0) {
                /* Add/remove attributes representing the breakpoints in the container array */
                previous.filter(bp => !cleanInput.includes(bp)).forEach(bp => this.resizeTarget.removeAttribute(bp));
            }

            cleanInput.filter(bp => !previous.includes(bp)).forEach(bp => this.resizeTarget.setAttribute(bp, ''));
        }

        /**
         * Optional processing functions to run when the container changes:
         * - init: runs when the container is first set
         * - onResize: runs when the container changes
         */
        containerInit: Function | undefined;
        onResize: Function | undefined;

        /**
         * Validate the resize event for changes to the provided breakpoints
         * TODO: incorporate matchMedia('screen and not(pointer: coarse) and not(hover: none)') etc.
         * TODO: Does this need to support any metrics other than width?
         */
        public validateResize(width: number): boolean {
            if (!this.breakpoints) return false;

            /* Clone the container so we can modify it without firing a refresh event */
            const newBPs: string[] = [...this.container];
            const oldBPs: string[] = [...this.container];
            let updated: boolean = false;
            let added: string[] = [];
            let removed: string[] = [];

            /* Iterate through the breakpoints and assign the appropriate container values */

            /* Capture the min and max sizes in the breakpoints map (pre-sorted high to low) */
            const minSize = Array.from(this.breakpoints.values())[this.breakpoints.size - 1];

            /* If the element width is less than the minimum breakpoint, remove all breakpoints */
            if (width < minSize) {
                removed = this.container;
                this.container = [];
                updated = true;
            } else {
              /* Otherwise, add or remove breakpoints as needed */
              this.breakpoints.forEach((bp: number, bpName: string) => {
                if (width >= bp && !newBPs.includes(bpName)) {
                  updated = true;
                  added.push(bpName);
                  newBPs.push(bpName);
                } else if (width < bp && newBPs.includes(bpName)) {
                  updated = true;
                  removed.push(bpName);
                  newBPs.splice(newBPs.indexOf(bpName), 1);
                }
              });
            }

            if (updated) {
              this.container = newBPs;
              this.dispatchEvent(new CustomEvent('breakpoint-update', {
                detail: {
                  all: newBPs.sort((a, b) => this._sortByBreakpoint(this.breakpoints.get(a)!, this.breakpoints.get(b)!)),
                  added: added.sort((a, b) => this._sortByBreakpoint(this.breakpoints.get(a)!, this.breakpoints.get(b)!)),
                  removed: removed.sort((a, b) => this._sortByBreakpoint(this.breakpoints.get(a)!, this.breakpoints.get(b)!)),
                },
                bubbles: true,
                composed: true
             }));              
            }

            return updated;
        }

        private _debounceResize(inputFunction: Function): Function {
            if (this.resizeDelay > 0) {
                return debounce(inputFunction, this.resizeDelay);
            }

            return inputFunction();
        }

        private _observer: ResizeController = new ResizeController(this, {
            target: this.resizeTarget,
            callback: entries => {
                const processEntry = (width: number) => {
                    const updated = this.validateResize(width);

                    /* If additional processing is provided, run that after breakpoints are validated and recorded */
                    if (this.onResize && updated) this.onResize();
                };

                entries.forEach(entry => {
                    if (entry.target === this.resizeTarget) {
                        this._debounceResize(processEntry)(entry.contentRect.width);
                    }
                });
            },
        });

        public connectedCallback(): void {
            super.connectedCallback();
            if (observe) {
                this._observer.observe(this.resizeTarget);
            } else {
                /* Check the breakpoints at the initial load state */
                this.validateResize(this.resizeTarget.getBoundingClientRect().width);
                /* Run the init hook if it exists */
                if (this.containerInit) this.containerInit();
            }
        }
    }
    return ContainerQueryElement;
}
