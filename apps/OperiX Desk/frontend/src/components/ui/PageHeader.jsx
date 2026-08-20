
export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className="standard-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
