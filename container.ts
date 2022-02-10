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

import { html, css, SpectrumElement, CSSResultArray, TemplateResult } from '@spectrum-web-components/base';
import { property, queryAll } from '@spectrum-web-components/base/src/decorators.js';
import { ContainerQueryMixin } from './container-query.js';
import { MutationController } from '@lit-labs/observers/mutation_controller.js';

/**
 * @element ue-container
 *
 * @slot start
 * @slot center
 * @slot end
 *
 */
export class Container extends ContainerQueryMixin(SpectrumElement, {
  customBreakpoints: new Map([
    ['xl', 1000],
    ['l', 800],
    ['m', 600],
    ['s', 400],
    ['xs', 200],
    ['xxs', 0]
  ])
}) {
    public static get styles(): CSSResultArray {
      const styles = css`
        :host{
          grid-gap:var(--ue-container-gap,var(--spectrum-global-dimension-size-50,4px));
          align-items:center;
          background-color:var(--spectrum-alias-background-color-secondary);
          box-sizing:border-box;
          color:var(--ue-container-text-color,var(--spectrum-alias-text-color,#212121));
          display:grid;
          gap:var(--ue-container-gap,var(--spectrum-global-dimension-size-50,4px));
          grid-template-columns:minmax(1px,var(--ue-container-grid_start-mobile,2fr)) minmax(1px,var(--ue-container-grid_center-mobile,3fr)) minmax(1px,var(--ue-container-grid_end-mobile,2fr));
          min-height:var(--ue-container-min-height-mobile,40px);
          padding:var(--ue-container-padding-vertical,var(--spectrum-global-dimension-size-50,4px)) var(--ue-container-padding-horizontal,var(--spectrum-global-dimension-size-50,4px));
          width:100%;
          box-shadow: 1px 1px 3px var(--spectrum-alias-dropshadow-color);
        }
        :host([desktop-s]){
          grid-template-columns:minmax(1px,var(--ue-container-grid_start,2fr)) minmax(1px,var(--ue-container-grid_center,3fr)) minmax(1px,var(--ue-container-grid_end,2fr));
          min-height:var(--ue-container-min-height-desktop,48px);
        }
        ::slotted([hidden]),:host([hidden]),[hidden]{
          display:none!important;
        }
        ::slotted(sp-divider){
          align-self:stretch;
          height:auto;
          margin:var(--spectrum-global-dimension-size-50,4px);
          min-width:1px;
        }
        slot {
          align-items:center;
          display:flex;
          flex-wrap:nowrap;
          gap:var(--ue-container-gap,var(--spectrum-global-dimension-size-50,4px));
        }
        slot[name=center] {
          flex-grow:1;
          justify-content:center;
        }
        slot[name=end]{
          justify-content:flex-end;
        }
        :host([dir=rtl]) slot[name=end]{
          order:0;
        }`;
      return [styles];
    }

    /**
     * Ability to opt-out of observers; useful for containers that do not need to scale or resize.
     */
    @property({
        type: Boolean,
        reflect: true,
        attribute: 'no-observers',
    })
    public noObservers = false;

    private _updatingSlots: boolean = false;

    /**
     * Ability to opt-out of dividers.
     */
    @property({
        type: Boolean,
        reflect: true,
        attribute: 'no-dividers',
    })
    public noDividers = false;

    // @ts-ignore noUnusedLocals
    private _observer = new MutationController(this, {
        target: this,
        callback: this._mutationProcessing.bind(this),
        config: {
            attributes: true,
            childList: true,
            subtree: true,
        },
        skipInitial: true,
    });

    @queryAll('slot')
    private _slots!: HTMLSlotElement[];

    @queryAll('sp-divider')
    private _dividers!: HTMLSlotElement[];

    @queryAll('slot:not([hidden])')
    private _visibleSlots!: HTMLSlotElement[];

    /* Combine all the assigned elements into a single array for easier use */
    // TODO: should likely be cached between slotchange events
    get _allAssignedElements(): HTMLElement[] {
        const assignedElements: Element[] = [];
        this._visibleSlots.forEach(slot => {
            assignedElements.push(...slot.assignedElements({ flatten: true }));
        });
        return assignedElements as HTMLElement[];
    }

    /* Check all slotted nodes for hide/show attributes and apply settings */
    public checkVisibility(): void {
        for (const action of ['hide', 'show']) {
            /* Check all slotted nodes for hide/show attributes and apply settings */
            [...this._slots, ...this._dividers]
                .filter(element => !!element.getAttributeNames().find(attribute => attribute.endsWith(`:${action}`)))
                .forEach(element => this.toggleVisibility(element, action));

            /* Run assigned nodes after we have toggled the parent-level slots */

            this._allAssignedElements
                .filter(element => !!element.getAttributeNames().find(attribute => attribute.endsWith(`:${action}`)))
                .forEach(element => this.toggleVisibility(element as HTMLElement, action));
        }

        this._visibleSlots.forEach(slot => this._toggleDividers(slot));
    }

    public toggleVisibility(element: HTMLElement, action: string): void {
        /* Check if any of the attribute breakpoints are defined on the slotted elements, isolate the breakpoint name from the action */
        element
            .getAttributeNames()
            .filter(attr => attr.endsWith(`:${action}`))
            .map(rule => {
                /* Validate if the breakpoint is currently active */
                let hasBreakpoint = this._hasBreakpointByName(rule.replace(`:${action}`, ''));

                /* If this action is to hide the element, we are checking that the breakpoint is not present */
                if (action !== 'hide') element.hidden = !hasBreakpoint;
                else element.hidden = hasBreakpoint;
            });
    }

    /* A standard initializer to set up the container  */
    containerInit: Function = this.checkVisibility;
    onResize: Function = this.checkVisibility;

    private _hasBreakpointByName(bpName: string): boolean {
        // Parse out the generic breakpoints for mobile and desktop
        if (bpName === 'desktop') {
            return this.container.includes('desktop-s');
        } else if (bpName === 'mobile') {
            return !this.container.includes('desktop-s');
        }

        return this.container.includes(bpName);
    }

    private _getSiblingSlot(element: HTMLElement, direction: string): HTMLSlotElement | undefined {
        return this._getSibling(element, direction, 'slot') as HTMLSlotElement;
    }

    private _getSibling(element: HTMLElement, direction: string, selector: string): HTMLElement | undefined {
        if (!element) return;
        const getSibling = (el: HTMLElement): HTMLElement | undefined => {
            return (direction === 'next' ? el.nextElementSibling : el.previousElementSibling) as HTMLElement;
        };

        // Get the next sibling element
        let sibling = getSibling(element);

        // If there's no selector, return the first sibling
        if (!selector) return sibling;

        // If the sibling matches our selector, use it
        // If not, jump to the next sibling and continue the loop
        while (sibling) {
            if (!selector) return sibling;
            if (sibling.matches(selector)) return sibling;
            sibling = getSibling(sibling);
        }

        return;
    }

    private _hasVisibleChildren(slot: HTMLSlotElement) {
        let elements = slot.assignedElements({ flatten: true }) as HTMLElement[];

        /* If there are no children, return false */
        if (elements.length === 0) return false;

        /* If there are children, check if any of them are visible */
        elements = elements.filter(element => !element.hidden);

        /* Capture the assigned nodes from the slot's existing variable */
        return elements.length > 0;
    }

    private _mutationProcessing(mutations: MutationRecord[]): void {
        // Don't process while updates are in progress
        if (this._updatingSlots) return;

        const slotNames: string[] = [];
        mutations
            .filter(mutation => mutation.type === 'attributes' && mutation.attributeName === 'hidden')
            .forEach(mutation => {
                const slot = (mutation.target as HTMLElement)?.assignedSlot;
                // Ensure processing only happens once per slot
                if (slot && !slotNames.includes(slot.name)) {
                    slotNames.push(slot.name);
                    this._toggleDividers(slot);
                }
            });
    }

    /* Toggle the dividers based on the slot's visibility; slot manages visiblity for it's next divider only */
    private _toggleDividers(slot: HTMLSlotElement) {
        const isVisible: Function = (slot: HTMLSlotElement) => slot && !slot.hidden && this._hasVisibleChildren(slot);

        const nextDivider = this._getSibling(slot, 'next', 'sp-divider');
        const prevDivider = this._getSibling(slot, 'previous', 'sp-divider');

        let nextSlot = this._getSiblingSlot(slot, 'next');
        let prevSlot = this._getSiblingSlot(slot, 'previous');

        let firstSlot = !isVisible(prevSlot);
        let lastSlot = !isVisible(nextSlot);

        /* Check if any of the next slots are visibile to determine if the next divider is visible */
        while (nextSlot && !isVisible(nextSlot)) {
            nextSlot = this._getSiblingSlot(nextSlot, 'next');
            lastSlot = lastSlot && !isVisible(nextSlot);
        }

        /* Check if any of the next slots are visibile to determine if the next divider is visible */
        while (prevSlot && !isVisible(prevSlot)) {
            prevSlot = this._getSiblingSlot(prevSlot, 'previous');
            firstSlot = firstSlot && !isVisible(prevSlot);
        }

        if (!nextDivider && !prevDivider) return;

        this._updatingSlots = true;
        nextDivider?.toggleAttribute('hidden', !isVisible(slot) || lastSlot);
        prevDivider?.toggleAttribute('hidden', (!isVisible(slot) && (lastSlot || firstSlot)) || (isVisible(slot) && firstSlot));
        this._updatingSlots = false;
    }

    renderDivider(): TemplateResult {
        if (this.noDividers) return html``;

        return html` <sp-divider vertical></sp-divider> `;
    }

    renderStart(): TemplateResult {
        return html`<slot name="start" id="#start"></slot>`;
    }

    renderCenter(): TemplateResult {
        return html`<slot name="center" id="#center"></slot>`;
    }

    renderEnd(): TemplateResult {
        return html`<slot name="end" id="#end"></slot>`;
    }

    protected render(): TemplateResult {
        return html`${this.renderStart()} ${this.renderCenter()} ${this.renderEnd()} `;
    }
}

customElements.define('ue-container', Container);
