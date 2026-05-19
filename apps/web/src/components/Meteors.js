import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
export function Meteors({ number = 20 }) {
    const [meteorStyles, setMeteorStyles] = useState([]);
    useEffect(() => {
        const styles = [...new Array(number)].map(() => ({
            top: Math.floor(Math.random() * 100) + "%",
            left: Math.floor(Math.random() * 100) + "%",
            animationDelay: Math.random() * 1 + 0.2 + "s",
            animationDuration: Math.floor(Math.random() * 8 + 2) + "s",
        }));
        setMeteorStyles(styles);
    }, [number]);
    return (_jsx(_Fragment, { children: meteorStyles.map((style, idx) => (_jsx("span", { className: "magic-meteor", style: style, children: _jsx("div", { className: "magic-meteor-tail" }) }, idx))) }));
}
