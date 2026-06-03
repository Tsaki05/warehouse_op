import { useState } from 'react';

export default function PasswordInput({ className = 'login-input', ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={className}
        style={{ paddingRight: 44, ...(props.style ?? {}) }}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#aab4be', fontSize: '1rem', padding: '2px 4px', lineHeight: 1,
        }}
        tabIndex={-1}
        aria-label={visible ? 'Amagar contrasenya' : 'Mostrar contrasenya'}
      >
        {visible ? '🙈' : '👁️'}
      </button>
    </div>
  );
}
