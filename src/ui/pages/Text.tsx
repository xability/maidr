import type { FC } from 'react';
import { useAppDispatch, useAppSelector } from '@redux/hook/useStore';
import { resetText } from '@redux/slice/textSlice';
import React, { useEffect } from 'react';

const Text: FC = () => {
  const dispatch = useAppDispatch();
  const { announce, value } = useAppSelector(state => state.text);

  useEffect(() => {
    return () => {
      dispatch(resetText());
    };
  }, [dispatch]);

  return (
    <div
      id="maidr-text-container"
      {...(announce && {
        'aria-live': 'assertive',
        'aria-atomic': 'true',
      })}
    >
      <p>
        {value}
      </p>
    </div>
  );
};

export default Text;
