// import { Constants } from "../../constants";
// import chatLLMTemplatehtml from "./chatLLMTemplate.html";

// export class ChatLLMManager {
//     constants: Constants;


//     constructor() {
//         this.constants = window.constants;
//     }

//     processTemplate(template: string): string {
//         return template.replace(/\$\{constants\.ariaMode\}/g, this.constants.ariaMode);
//     }

//     CreateComponent(): void {
//        const llmhtml = this.processTemplate(chatLLMTemplatehtml);
//        document.querySelector('body')?.insertAdjacentHTML('beforeend', llmhtml);
//     }

    
// }