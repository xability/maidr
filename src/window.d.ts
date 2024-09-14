import Maidr from "./maidr";

export {}

declare global {
    interface Window {
        maidr: Maidr
    }
}