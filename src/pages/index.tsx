import React, { useEffect, useState } from "react";

import FrontendService from "../core/service/frontend";
import { ConfigurationDialog } from "./Configuration/ConfigurationDialog";
import { ConfigurationProvider } from "./Configuration/ConfigurationProvider";
import HelpMenu from "./HelpMenu";
import { LLMDialog } from "./LLM/LLMDialog";
import { LLMProvider } from "./LLM/LLMProvider";

interface ReactMicroFrontendProps {
  frontendManager: FrontendService;
}

const ReactMicroFrontend: React.FC<ReactMicroFrontendProps> = (
  frontendManager,
) => {
  const [component, setComponent] = useState<string | null>(null);

  useEffect(() => {
    frontendManager.frontendManager.setFrontendKeyMap((key: string) => {
      setComponent(key);
    });
  }, []);

  const renderComponent = (key: string | null) => {
    switch (key) {
      case "HELP_MENU":
        return <HelpMenu />;
      case "LLM_DIALOG":
        return (
          <LLMProvider
            maidrJson={frontendManager.frontendManager.maidrJson}
            image={frontendManager.frontendManager.image}
          >
            <LLMDialog />
          </LLMProvider>
        );
      case "CONFIGURATION_DIALOG":
        return <ConfigurationDialog />;
    }
    return <></>;
  };

  return (
    <div>
      <ConfigurationProvider>
        {renderComponent(component)}
      </ConfigurationProvider>
    </div>
  );
};

export default ReactMicroFrontend;
