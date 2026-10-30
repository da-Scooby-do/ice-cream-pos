// صفحة رسم القسيمة | a blank white page the desktop app draws receipts on
// (electron/escpos.cjs puts the slip in #frame and takes a picture of it).
export const dynamic = "force-static";

export default function PrintFrame() {
  return (
    <>
      <style>{"html,body{background:#fff!important;margin:0!important;padding:0!important}"}</style>
      <div id="frame" style={{ width: "72mm", background: "#fff" }} />
    </>
  );
}
