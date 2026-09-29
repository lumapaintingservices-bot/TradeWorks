import logo from "../design/logo.svg";
export const Logo = ({ size = 34 }: { size?: number }) => <img src={logo} width={size} height={size} alt="" style={{ borderRadius: size * 0.26 }} />;
