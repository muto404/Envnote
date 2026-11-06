import { Folder, HardDrive, Plus } from "lucide-react";
import { basename } from "../core/files";
import type { Project } from "../core/types";
import { BrandMark } from "./Marks";
import { useScrollEdges } from "./useScrollEdges";

interface SidebarProps {
  projects: Project[];
  selectedId: string | undefined;
  dirty: boolean;
  disabled: boolean;
  preview: boolean;
  canAdd: boolean;
  onAdd: () => void;
  onSelect: (project: Project) => void;
}

export function Sidebar({ projects, selectedId, dirty, disabled, preview, canAdd, onAdd, onSelect }: SidebarProps) {
  const { viewport, content } = useScrollEdges<HTMLElement>();

  return (
    <aside className="sidebar" aria-label="项目栏">
      <div className="brand">
        <BrandMark />
        <span className="brand-name">Envnote</span>
      </div>
      <div className="projects-heading">
        <h2>项目</h2>
        {canAdd && (
          <button type="button" className="icon-button" title="添加项目" aria-label="添加项目" disabled={disabled} onClick={onAdd}>
            <Plus size={18} />
          </button>
        )}
      </div>
      <div className="sidebar-projects">
        <nav className="projects" aria-label="项目" ref={viewport}>
          <div className="projects-content" ref={content}>
            {projects.length === 0 && <p className="sidebar-empty">还没有项目</p>}
            {projects.map((project) => {
              const selected = project.id === selectedId;
              return (
                <button
                  type="button"
                  className="project-item"
                  key={project.id}
                  aria-current={selected ? "true" : undefined}
                  title={project.directory}
                  disabled={disabled}
                  onClick={() => onSelect(project)}
                >
                  <Folder className="project-icon" size={18} />
                  <span className="project-label">
                    <span className="project-name">{project.name}</span>
                    <code>{basename(project.filePath)}</code>
                  </span>
                  {selected && dirty && <span className="dirty-dot" title="有未保存的更改" />}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
      <div className="sidebar-footer">
        <HardDrive size={15} />
        <span>{preview ? "演示预览 · 模拟文件" : "本地工作区"}</span>
      </div>
    </aside>
  );
}
