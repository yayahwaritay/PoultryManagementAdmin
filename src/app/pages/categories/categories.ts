import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AdminCategoriesService } from '../../core/admin/admin-categories.service';
import { CategoryDto } from '../../core/admin/admin.models';
import { extractApiErrorMessage } from '../../core/api-error';

interface EditDraft {
  name: string;
  description: string;
  isActive: boolean;
}

@Component({
  selector: 'app-categories',
  imports: [ReactiveFormsModule, FormsModule, DatePipe],
  templateUrl: './categories.html',
  styleUrl: './categories.css'
})
export class Categories {
  private readonly api = inject(AdminCategoriesService);
  private readonly fb = inject(FormBuilder);

  readonly categories = signal<CategoryDto[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly showCreateForm = signal(false);
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);

  readonly editingId = signal<string | null>(null);
  readonly editDraft = signal<EditDraft>({ name: '', description: '', isActive: true });
  readonly savingEdit = signal(false);
  readonly editError = signal<string | null>(null);

  readonly deletingId = signal<string | null>(null);
  readonly deleteError = signal<string | null>(null);

  readonly createForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: ['']
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.list().subscribe({
      next: (categories) => {
        this.categories.set(categories);
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(extractApiErrorMessage(err, 'Could not load categories.'));
        this.loading.set(false);
      }
    });
  }

  toggleCreateForm(): void {
    this.showCreateForm.update((v) => !v);
    this.createError.set(null);
    this.createForm.reset({ name: '', description: '' });
  }

  submitCreate(): void {
    if (this.createForm.invalid || this.creating()) {
      this.createForm.markAllAsTouched();
      return;
    }
    this.creating.set(true);
    this.createError.set(null);
    const { name, description } = this.createForm.getRawValue();
    this.api
      .create({ name, description: description || null })
      .pipe(finalize(() => this.creating.set(false)))
      .subscribe({
        next: (category) => {
          this.categories.update((list) => [...list, category]);
          this.showCreateForm.set(false);
          this.createForm.reset({ name: '', description: '' });
        },
        error: (err) => this.createError.set(extractApiErrorMessage(err, 'Could not create category.'))
      });
  }

  startEdit(category: CategoryDto): void {
    this.editingId.set(category.id);
    this.editError.set(null);
    this.editDraft.set({
      name: category.name,
      description: category.description ?? '',
      isActive: category.isActive
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editError.set(null);
  }

  updateDraft(patch: Partial<EditDraft>): void {
    this.editDraft.update((d) => ({ ...d, ...patch }));
  }

  saveEdit(id: string): void {
    const draft = this.editDraft();
    if (!draft.name.trim()) {
      this.editError.set('Name is required.');
      return;
    }
    this.savingEdit.set(true);
    this.editError.set(null);
    this.api
      .update(id, { name: draft.name, description: draft.description || null, isActive: draft.isActive })
      .pipe(finalize(() => this.savingEdit.set(false)))
      .subscribe({
        next: (updated) => {
          this.categories.update((list) => list.map((c) => (c.id === id ? updated : c)));
          this.editingId.set(null);
        },
        error: (err) => this.editError.set(extractApiErrorMessage(err, 'Could not save changes.'))
      });
  }

  remove(category: CategoryDto): void {
    if (!confirm(`Delete category "${category.name}"? This can't be undone.`)) return;
    this.deletingId.set(category.id);
    this.deleteError.set(null);
    this.api.delete(category.id).subscribe({
      next: () => {
        this.categories.update((list) => list.filter((c) => c.id !== category.id));
        this.deletingId.set(null);
      },
      error: (err) => {
        this.deleteError.set(extractApiErrorMessage(err, 'Could not delete category.'));
        this.deletingId.set(null);
      }
    });
  }
}
