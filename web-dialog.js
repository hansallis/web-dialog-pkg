import '@a11y/focus-trap';
import { traverseActiveElements, setDialogCount, getDialogCount } from './util.js';

var styles = `*{box-sizing:border-box}:host{padding:var(--dialog-container-padding,5vw 24px);z-index:var(--dialog-z-index,12345678);outline:none}#backdrop,:host{position:fixed;top:0;left:0;bottom:0;right:0}:host,:host([center]) #dialog{overflow-x:var(--dialog-overflow-x,hidden);overflow-y:var(--dialog-overflow-y,auto);overscroll-behavior:contain;-webkit-overflow-scrolling:touch}:host([center]){display:flex;align-items:center;justify-content:center;overflow:hidden}:host([center]) #dialog{max-height:var(--dialog-max-height,100%)}:host(:not(:defined)),:host(:not([open])){display:none}#backdrop{background:var(--dialog-backdrop-bg,rgba(0,0,0,.6));animation:fadeIn var(--dialog-animation-duration,.1s) var(--dialog-animation-easing,ease-out);z-index:-1}#dialog{animation:scaleIn var(--dialog-animation-duration,.1s) var(--dialog-animation-easing,ease-out);border-radius:var(--dialog-border-radius,12px);box-shadow:var(--dialog-box-shadow,0 2px 10px -5px rgba(0,0,0,.6));max-width:var(--dialog-max-width,700px);width:var(--dialog-width,100%);padding:var(--dialog-padding,24px);max-height:var(--dialog-max-height,unset);height:var(--dialog-height,auto);color:var(--dialog-color,currentColor);background:var(--dialog-bg,#fff);z-index:1;position:relative;display:flex;flex-direction:column;margin:0 auto;border:none}::slotted(article),article{flex-grow:1;overflow-y:auto;-webkit-overflow-scrolling:touch}::slotted(footer),::slotted(header),footer,header{flex-shrink:0}@keyframes scaleIn{0%{transform:scale(.9) translateY(30px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}@keyframes fadeIn{0%{opacity:0}to{opacity:1}}`;

const template = document.createElement("template");
template.innerHTML = `
  <style>${styles}</style>
  <div id="backdrop" part="backdrop"></div>
  <focus-trap id="dialog" part="dialog">
    <slot></slot>
  </focus-trap>
`;
/**
 * A dialog web component that can be used to display highly interruptive messages.
 * @fires open - This event is fired when the dialog opens.
 * @fires close - This event is fired when the dialog closes.
 * @fires closing - This event is fired before the dialog is closed by clicking escape or on the backdrop. The event is cancellable which means `event.preventDefault()` can cancel the closing of the dialog.
 * @cssprop --dialog-container-padding - Padding of the host container of the dialog.
 * @cssprop --dialog-z-index - Z-index of the dialog.
 * @cssprop --dialog-overflow-x - Overflow of the x-axis.
 * @cssprop --dialog-overflow-y - Overflow of the y-axis.
 * @cssprop --dialog-max-height - Max height of the dialog.
 * @cssprop --dialog-height - Height of the dialog.
 * @cssprop --dialog-backdrop-bg - Background of the backdrop.
 * @cssprop --dialog-animation-duration - Duration of the dialog animation.
 * @cssprop --dialog-animation-easing - Easing of the dialog animation.
 * @cssprop --dialog-border-radius - Border radius of the dialog.
 * @cssprop --dialog-box-shadow - Box shadow of the dialog.
 * @cssprop --dialog-max-width - Max width of the dialog.
 * @cssprop --dialog-width - Width of the dialog.
 * @cssprop --dialog-padding - Padding of the dialog.
 * @cssprop --dialog-color - Color of the dialog.
 * @cssprop --dialog-bg - Background of the dialog.
 * @csspart backdrop - Backdrop part.
 * @csspart dialog - Dialog part.
 */
class WebDialog extends HTMLElement {
    /**
     * Attaches the shadow root.
     */
    constructor() {
        super();
        this.$scrollContainer = document.documentElement;
        this.$previousActiveElement = null;
        const shadow = this.attachShadow({ mode: "open" });
        shadow.appendChild(template.content.cloneNode(true));
        this.$dialog = shadow.querySelector("#dialog");
        this.$backdrop = shadow.querySelector("#backdrop");
        this.onBackdropClick = this.onBackdropClick.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        // Set aria attributes
        this.$dialog.setAttribute("role", "alertdialog");
    }
    static get observedAttributes() {
        return ["open", "center"];
    }
    /**
     * Whether the dialog is opened.
     * @attr
     */
    get open() {
        return this.hasAttribute("open");
    }
    set open(value) {
        value ? this.setAttribute("open", "") : this.removeAttribute("open");
    }
    /**
     * Whether the dialog is centered on the page.
     * @attr
     */
    get center() {
        return this.hasAttribute("center");
    }
    set center(value) {
        value ? this.setAttribute("center", "") : this.removeAttribute("center");
    }
    /**
     * Attaches event listeners when connected.
     */
    connectedCallback() {
        this.setAttribute("aria-modal", "true");
        this.$backdrop.addEventListener("click", this.onBackdropClick);
    }
    /**
     * Removes event listeners when disconnected.
     */
    disconnectedCallback() {
        this.$backdrop.removeEventListener("click", this.onBackdropClick);
        // If the dialog is open when it is removed from the DOM
        // we need to cleanup the event listeners and side effects.
        if (this.open) {
            this.didClose();
        }
    }
    /**
     * Shows the dialog.
     */
    show() {
        this.open = true;
    }
    /**
     * Closes the dialog with a result.
     * @param result
     */
    close(result) {
        this.result = result;
        this.open = false;
    }
    /**
     * Closes the dialog when the backdrop is clicked.
     */
    onBackdropClick() {
        if (this.assertClosing()) {
            this.close();
        }
    }
    /**
     * Closes the dialog when escape is pressed.
     */
    onKeyDown(e) {
        switch (e.code) {
            case "Escape":
                if (this.assertClosing()) {
                    this.close();
                    // If there are more dialogs, we don't want to close those also :-)
                    e.stopImmediatePropagation();
                }
                break;
        }
    }
    /**
     * Dispatches an event that, if asserts whether the dialog can be closed.
     * If "preventDefault()" is called on the event, assertClosing will return true
     * if the event was not cancelled. It will return false if the event was cancelled.
     */
    assertClosing() {
        return this.dispatchEvent(new CustomEvent("closing", { cancelable: true }));
    }
    /**
     * Setup the dialog after it has opened.
     */
    didOpen() {
        // Save the current active element so we have a way of restoring the focus when the dialog is closed.
        this.$previousActiveElement = traverseActiveElements(document.activeElement);
        // Focus the first element in the focus trap.
        // Wait for the dialog to show its content before we try to focus inside it.
        // We request an animation frame to make sure the content is now visible.
        requestAnimationFrame(() => {
            this.$dialog.focusFirstElement();
        });
        // Make the dialog focusable
        this.tabIndex = 0;
        // Block the scrolling on the scroll container to avoid the outside content to scroll.
        this.$scrollContainer.style.overflow = `hidden`;
        // Listen for key down events to close the dialog when escape is pressed.
        this.addEventListener("keydown", this.onKeyDown, { capture: true, passive: true });
        // Increment the dialog count with one to keep track of how many dialogs are currently nested.
        setDialogCount(this.$scrollContainer, getDialogCount(this.$scrollContainer) + 1);
        // Dispatch an event so the rest of the world knows the dialog opened.
        this.dispatchEvent(new CustomEvent("open"));
    }
    /**
     * Clean up the dialog after it has closed.
     */
    didClose() {
        // Remove the listener listening for key events
        this.removeEventListener("keydown", this.onKeyDown, { capture: true });
        // Decrement the dialog count with one to keep track of how many dialogs are currently nested.
        setDialogCount(this.$scrollContainer, Math.max(0, getDialogCount(this.$scrollContainer) - 1));
        // If there are now 0 active dialogs we unblock the scrolling from the scroll container.
        // This is because we know that no other dialogs are currently nested within the scroll container.
        if (getDialogCount(this.$scrollContainer) <= 0) {
            this.$scrollContainer.style.overflow = ``;
        }
        // Make the dialog unfocusable.
        this.tabIndex = -1;
        // Restore previous active element.
        if (this.$previousActiveElement != null) {
            this.$previousActiveElement.focus();
            this.$previousActiveElement = null;
        }
        // Dispatch an event so the rest of the world knows the dialog closed.
        // If a result has been set, the result is added to the detail property of the event.
        this.dispatchEvent(new CustomEvent("close", { detail: this.result }));
    }
    /**
     * Reacts when an observed attribute changes.
     */
    attributeChangedCallback(name, newValue, oldValue) {
        switch (name) {
            case "open":
                this.open ? this.didOpen() : this.didClose();
                break;
        }
    }
}
customElements.define("web-dialog", WebDialog);

export { WebDialog };
