import React, { useEffect, useState } from "react";
import HelpMenu from "./HelpMenu";
import FrontendService from "../core/service/frontend";

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
    }
    return <></>;
  };

  return <div>{renderComponent(component)}</div>;
};

export default ReactMicroFrontend;
