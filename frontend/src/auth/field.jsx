import { useId, useState } from 'react';

export function Field({ label, error, right, id, ...input }) {
    const uid = useId();
    const fid = id || uid;
    const eid = `${fid}-err`;
    return (
        <div className={'af' + (error ? ' af-bad' : '')}>
            <label htmlFor={fid}>{label}</label>
            <div className="af-box">
                <input id={fid} aria-invalid={!!error} aria-describedby={error ? eid : undefined} {...input} />
                {right}
            </div>
            {error && <p id={eid} className="af-err" role="alert">{error}</p>}
        </div>
    );
}

export function PasswordField(props) {
    const [show, setShow] = useState(false);
    return (
        <Field
            {...props}
            type={show ? 'text' : 'password'}
            right={
                <button
                    type="button"
                    className="af-eye"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    aria-pressed={show}
                >
                    {show ? 'Hide' : 'Show'}
                </button>
            }
        />
    );
}
