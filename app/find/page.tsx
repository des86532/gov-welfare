import { WelfareFinder } from "@/components/welfare-finder";
import { getPrograms } from "@/lib/program-store";

export const metadata = { title: "資格初篩" };

export default async function FindPage() {
  const programs = await getPrograms();
  return (
    <div className="page-shell finder-page">
      <header className="page-title">
        <p className="eyebrow">Private by design</p>
        <h1>找出你可能適用的福利</h1>
        <p>約 2–4 分鐘。你可以跳過任何題目，平台會把無法確認的條件保留為 unknown。</p>
      </header>
      <WelfareFinder programs={programs} />
    </div>
  );
}
