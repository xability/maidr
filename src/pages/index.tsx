import React, { useEffect, useState } from "react";
import { HelpMenu } from "./HelpMenu";
import { LLMDialog } from "./LLM/LLMDialog";
import { LLMProvider } from "./LLM/LLMProvider";
import { ConfigurationDialog } from "./Configuration/ConfigurationDialog";
import { ConfigurationProvider } from "./Configuration/ConfigurationProvider";
import FrontendManager from "../core/service/frontend";

interface ReactMicroFrontendProps {
  frontendManager: FrontendManager;
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
