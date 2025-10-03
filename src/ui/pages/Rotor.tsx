import { useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React, { useId } from 'react';

const Rotor: React.FC = () => {
  const id = useId();
  const { value } = useViewModelState('rotor');
  const settings = useViewModelState('settings');

  return (
    <div id={id}>
      <p
        id={`${Constant.ROTOR_AREA}-${id}`}
        aria-live={settings.general.ariaMode}
      >
        {value}
      </p>
    </div>
  );
};

export default Rotor;
