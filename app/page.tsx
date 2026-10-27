import { redirect } from "next/navigation";

// The Squad builder is the app's home screen (mirrors FPL's "Pick Team" landing).
export default function HomePage() {
  redirect("/squad");
}

