import { Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AdminProductsService } from '../../core/admin/admin-products.service';
import { AdminCategoriesService } from '../../core/admin/admin-categories.service';
import { CategoryDto, ProductDto } from '../../core/admin/admin.models';
import { extractApiErrorMessage } from '../../core/api-error';
import { resolveMediaUrl } from '../../core/media-url';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-products',
  imports: [ReactiveFormsModule, FormsModule, DatePipe, DecimalPipe],
  templateUrl: './products.html',
  styleUrl: './products.css'
})
export class Products {
  private readonly api = inject(AdminProductsService);
  private readonly categoriesApi = inject(AdminCategoriesService);
  private readonly fb = inject(FormBuilder);

  readonly products = signal<ProductDto[]>([]);
  readonly categories = signal<CategoryDto[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly page = signal(1);
  readonly totalPages = signal(1);
  readonly totalCount = signal(0);

  readonly filterCategoryId = signal('');
  readonly filterSearch = signal('');

  readonly showForm = signal(false);
  readonly editingProduct = signal<ProductDto | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly imagePreview = signal<string | null>(null);
  readonly imageUrl = resolveMediaUrl;

  readonly deletingId = signal<string | null>(null);
  readonly rowError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    categoryId: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(0.01)]],
    quantityInStock: [0, [Validators.required, Validators.min(0)]],
    isActive: [true]
  });

  private selectedFile: File | null = null;

  constructor() {
    this.categoriesApi.list().subscribe({
      next: (categories) => this.categories.set(categories),
      error: () => {
        /* category dropdown just stays empty; the list/table itself still works */
      }
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api
      .list({
        categoryId: this.filterCategoryId() || undefined,
        search: this.filterSearch() || undefined,
        page: this.page(),
        pageSize: PAGE_SIZE
      })
      .subscribe({
        next: (result) => {
          this.products.set(result.items);
          this.page.set(result.page);
          this.totalPages.set(result.totalPages);
          this.totalCount.set(result.totalCount);
          this.loading.set(false);
        },
        error: (err) => {
          this.loadError.set(extractApiErrorMessage(err, 'Could not load products.'));
          this.loading.set(false);
        }
      });
  }

  applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  goToPage(delta: number): void {
    const next = this.page() + delta;
    if (next < 1 || next > this.totalPages()) return;
    this.page.set(next);
    this.load();
  }

  openCreateForm(): void {
    this.editingProduct.set(null);
    this.selectedFile = null;
    this.imagePreview.set(null);
    this.formError.set(null);
    this.form.reset({
      name: '',
      description: '',
      categoryId: '',
      price: 0,
      quantityInStock: 0,
      isActive: true
    });
    this.showForm.set(true);
  }

  openEditForm(product: ProductDto): void {
    this.editingProduct.set(product);
    this.selectedFile = null;
    this.imagePreview.set(resolveMediaUrl(product.imagePath));
    this.formError.set(null);
    this.form.reset({
      name: product.name,
      description: product.description ?? '',
      categoryId: product.categoryId,
      price: product.priceCents / 100,
      quantityInStock: product.quantityInStock,
      isActive: product.isActive
    });
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedFile = file;
    if (file) {
      const reader = new FileReader();
      reader.onload = () => this.imagePreview.set(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, description, categoryId, price, quantityInStock, isActive } = this.form.getRawValue();
    const payload = {
      name,
      description: description || null,
      categoryId,
      priceCents: Math.round(price * 100),
      quantityInStock,
      image: this.selectedFile,
      isActive
    };

    this.saving.set(true);
    this.formError.set(null);

    const editing = this.editingProduct();
    const request = editing ? this.api.update(editing.id, payload) : this.api.create(payload);

    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (product) => {
        if (editing) {
          this.products.update((list) => list.map((p) => (p.id === product.id ? product : p)));
        } else {
          this.products.update((list) => [product, ...list]);
        }
        this.showForm.set(false);
      },
      error: (err) => this.formError.set(extractApiErrorMessage(err, 'Could not save product.'))
    });
  }

  remove(product: ProductDto): void {
    if (!confirm(`Deactivate "${product.name}"? It will be hidden from the storefront.`)) return;
    this.deletingId.set(product.id);
    this.rowError.set(null);
    this.api.delete(product.id).subscribe({
      next: () => {
        this.products.update((list) =>
          list.map((p) => (p.id === product.id ? { ...p, isActive: false } : p))
        );
        this.deletingId.set(null);
      },
      error: (err) => {
        this.rowError.set(extractApiErrorMessage(err, 'Could not deactivate product.'));
        this.deletingId.set(null);
      }
    });
  }
}
